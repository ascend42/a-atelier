/**
 * `atelier studio [file]` — launch the browser-based Atelier editor.
 *
 * Spins up a Vite dev server with a temporary app that imports AtelierStudio,
 * provides a file API for reading/writing .atelier files from CWD, and opens
 * the browser.
 *
 * Usage:
 *   atelier studio                          → browse all .atelier files in CWD
 *   atelier studio my-animation.atelier     → open specific file
 *   atelier studio --port 8080              → custom port
 *   atelier studio --no-open                → don't auto-open browser
 */

import { resolve, join, relative, dirname } from "node:path";
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync, realpathSync, symlinkSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import type { Command } from "commander";
import {
  DocumentStore,
  WebSocketServerTransport,
  createServer as createMcpServer,
  BRIDGE_PROTOCOL_VERSION,
  isBridgeEnvelope,
  type BridgeEnvelope,
} from "@a-company/atelier-mcp";
import { parseAtelier, serializeAtelier } from "@a-company/atelier-schema";
import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";

/** Recursively glob for .atelier files under a directory. */
function findAtelierFiles(dir: string, base: string = dir): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...findAtelierFiles(full, base));
    } else if (entry.endsWith(".atelier")) {
      results.push(relative(base, full));
    }
  }
  return results.sort();
}

/** Validate that a file path is safe (relative, no traversal). */
function isSafePath(filePath: string): boolean {
  if (!filePath || filePath.includes("..") || filePath.startsWith("/")) return false;
  const resolved = resolve(process.cwd(), filePath);
  return resolved.startsWith(process.cwd());
}

/**
 * Shared origin-check used by both REST middleware and WS upgrade handler.
 * ^localhost-only: WebSocket upgrade requests bypass connect middleware
 * entirely, so the bridge MUST re-run this check before accepting the
 * upgrade — otherwise an arbitrary cross-origin browser tab could connect
 * to /bridge or /mcp and drive the studio.
 */
export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (!origin) return false;
  return (
    origin === `http://localhost:${port}` ||
    origin === `http://127.0.0.1:${port}`
  );
}

// ─── Bridge & MCP-over-WS wiring ────────────────────────────────────────────
//
// The bridge connects an external MCP client (e.g. Claude Desktop running
// `atelier-mcp` over WS) to the in-browser AtelierStudio. The full loop:
//
//   external LLM tool ──► McpServer (per WS conn) ──► shared DocumentStore
//                                                            │
//                                            onChange (source≠"human")
//                                                            ▼
//                                       broadcast `llm:mutation` envelope
//                                                            ▼
//                                       browser applies via studio.applyMutation
//
//   browser human edit ──► fetch /api/file (POST) ──► writeFileSync ──► store.set(source:"human")
//                                                                              │
//                                                              onChange (filtered: human)
//                                                                              ▼
//                                                               NOT broadcast (skip echo)
//
//   browser doc:patch (WS) ──► store.set(source:"human") + writeFileSync       │
//                                                                              ▼
//                                                               NOT broadcast (skip echo)
//
// Single-doc invariant for v1: the studio session tracks one currentDocId
// (the most-recently-loaded file path). When a new bridge client connects
// mid-session it receives `doc:loaded` for whatever's currently active.

/** State held across the studio session — exported so tests can drive it. */
export interface BridgeSessionState {
  store: DocumentStore;
  /** Most-recently-loaded file path; null until first load. */
  currentDocId: string | null;
}

/**
 * Wrap a `ws.WebSocket` (already accepted as a /bridge connection) so it
 * receives the `hello` + initial `doc:loaded` handshake and joins the
 * broadcast set.
 *
 * Returned `dispose` removes the client from the set and unhooks listeners.
 */
export function attachBridgeClient(
  ws: WsWebSocket,
  state: BridgeSessionState,
  clients: Set<WsWebSocket>,
  loadDocFromDisk: (docId: string) => string | null,
  /** Persist a human-sourced inbound doc:patch envelope to disk. */
  persistHumanPatch: (docId: string, doc: import("@a-company/atelier-types").AtelierDocument) => void,
): () => void {
  clients.add(ws);

  const clientId = randomBytes(6).toString("hex");
  const send = (env: BridgeEnvelope): void => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(env));
  };

  send({ type: "hello", clientId, protocolVersion: BRIDGE_PROTOCOL_VERSION });

  if (state.currentDocId) {
    const existing = state.store.get(state.currentDocId);
    if (existing) {
      send({ type: "doc:loaded", documentId: state.currentDocId, doc: existing });
    } else {
      // Re-hydrate from disk if the store hasn't seen it yet (e.g. bridge
      // client connected before the browser loaded any file).
      const raw = loadDocFromDisk(state.currentDocId);
      if (raw) {
        const parsed = parseAtelier(raw);
        if (parsed.success) {
          state.store.set(state.currentDocId, parsed.data, "system");
          send({ type: "doc:loaded", documentId: state.currentDocId, doc: parsed.data });
        }
      }
    }
  }

  const onMessage = (data: unknown): void => {
    let text: string;
    if (typeof data === "string") text = data;
    else if (data instanceof Buffer) text = data.toString("utf-8");
    else if (Array.isArray(data)) text = Buffer.concat(data as Buffer[]).toString("utf-8");
    else text = String(data);

    let env: unknown;
    try {
      env = JSON.parse(text);
    } catch {
      send({ type: "error", code: "parse_error", message: "invalid JSON" });
      return;
    }

    if (!isBridgeEnvelope(env)) {
      send({ type: "error", code: "invalid_envelope", message: "unknown envelope shape" });
      return;
    }

    if (env.type === "doc:patch") {
      // Browser-originated edit. Persist + mirror into the store with
      // source:"human" so the onChange filter skips re-broadcasting it
      // (which would echo back to the same browser that just emitted it).
      try {
        state.store.set(env.documentId, env.doc, "human");
        state.currentDocId = env.documentId;
        persistHumanPatch(env.documentId, env.doc);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", code: "persist_failed", message: msg, opId: env.opId });
      }
      return;
    }

    if (env.type === "doc:load") {
      const existing = state.store.get(env.documentId);
      if (existing) {
        send({ type: "doc:loaded", documentId: env.documentId, doc: existing });
        return;
      }
      const raw = loadDocFromDisk(env.documentId);
      if (raw) {
        const parsed = parseAtelier(raw);
        if (parsed.success) {
          state.store.set(env.documentId, parsed.data, "system");
          send({ type: "doc:loaded", documentId: env.documentId, doc: parsed.data });
          return;
        }
      }
      send({ type: "error", code: "not_found", message: `document ${env.documentId} not found` });
      return;
    }

    // hello / doc:loaded / llm:mutation / error are server-→client only.
    // Ignore silently; a future protocol revision may use them bidirectionally.
  };

  const onClose = (): void => {
    clients.delete(ws);
  };

  ws.on("message", onMessage);
  ws.on("close", onClose);
  ws.on("error", onClose);

  return () => {
    clients.delete(ws);
    try {
      ws.close();
    } catch {
      // ignore
    }
  };
}

/**
 * Broadcast a single envelope to all connected bridge clients.
 * Silently skips clients that are not OPEN — the close handler removes
 * them on the next tick.
 */
export function broadcastToBridge(
  clients: Set<WsWebSocket>,
  envelope: BridgeEnvelope,
): void {
  const payload = JSON.stringify(envelope);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(payload);
      } catch {
        // Drop on send-failure; the close handler cleans up.
      }
    }
  }
}

function getInlineHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Atelier Studio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="studio"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>`;
}

function getInlineApp(initialFile: string | null): string {
  const initialFileStr = initialFile ? JSON.stringify(initialFile) : "null";
  return `import { AtelierStudio, exportDocument, ImageCache } from "@a-company/atelier-studio";
import "@a-company/atelier-studio/styles.css";
import { parseAtelier, serializeAtelier } from "@a-company/atelier-schema";

// ── Types ──
interface FileEntry {
  path: string;
  name: string;
  folder: string;
}

// ── State ──
let studio: AtelierStudio | null = null;
let currentFile: string | null = null;
let files: FileEntry[] = [];
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let bridgeSocket: WebSocket | null = null;
// One-tick suppression: when the bridge delivers an LLM mutation we apply it
// via studio.applyMutation (which sets suppressNotify internally) — the
// resulting onDocumentChange callback won't fire, so we don't echo back.
// This flag is a backstop in case future studio refactors change that path.
let suppressOutbound = false;

// ── API helpers ──
async function fetchFiles(): Promise<FileEntry[]> {
  const res = await fetch("/api/files");
  return res.json();
}

async function fetchFileContent(path: string): Promise<string> {
  const res = await fetch("/api/file?path=" + encodeURIComponent(path));
  return res.text();
}

async function saveFileContent(path: string, content: string): Promise<void> {
  const res = await fetch("/api/file?path=" + encodeURIComponent(path), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: content,
  });
  if (!res.ok) {
    const message = (await res.text()) || ("HTTP " + res.status);
    throw new Error(message);
  }
}

async function saveExportBlob(path: string, blob: Blob): Promise<void> {
  const buf = await blob.arrayBuffer();
  await fetch("/api/export?path=" + encodeURIComponent(path), {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
}

async function exportAll(format: "gif" | "mp4" | "webm"): Promise<void> {
  if (files.length === 0) return;

  // Create progress overlay
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:10000";
  const card = document.createElement("div");
  card.style.cssText = "background:#333;border:1px solid #4A4A4A;border-radius:8px;padding:32px 40px;min-width:360px;color:#F5F0EB;font-family:'Cormorant Garamond',Georgia,serif";
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const title = document.createElement("div");
  title.style.cssText = "font-size:18px;margin-bottom:16px;font-weight:600";
  title.textContent = "Exporting All Files…";
  card.appendChild(title);

  const fileLabel = document.createElement("div");
  fileLabel.style.cssText = "font-size:13px;color:#A89F95;margin-bottom:8px;font-family:'SF Mono','Fira Code',monospace";
  card.appendChild(fileLabel);

  const progress = document.createElement("progress");
  progress.style.cssText = "width:100%;height:6px;appearance:none;-webkit-appearance:none";
  progress.max = files.length;
  progress.value = 0;
  card.appendChild(progress);

  const statusText = document.createElement("div");
  statusText.style.cssText = "font-size:12px;color:#A89F95;margin-top:8px";
  card.appendChild(statusText);

  let exported = 0;
  let errors = 0;

  for (const file of files) {
    fileLabel.textContent = file.path;
    statusText.textContent = (exported + errors + 1) + " / " + files.length;

    try {
      const content = await fetchFileContent(file.path);
      const result = parseAtelier(content);
      if (!result.success) {
        errors++;
        progress.value = exported + errors;
        continue;
      }

      const doc = result.data;
      const w = doc.canvas.width;
      const h = doc.canvas.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const imageCache = new ImageCache();

      const exportResult = await exportDocument(doc, canvas, imageCache, {
        format,
        onProgress: ({ percent }) => {
          statusText.textContent = (exported + errors + 1) + " / " + files.length + " — " + percent + "%";
        },
      });

      // Save alongside the source file: e.g. "dir/my-anim.atelier" → "dir/my-anim.gif"
      const outPath = file.path.replace(/\\.atelier$/, "." + format);
      await saveExportBlob(outPath, exportResult.blob);
      exported++;
    } catch (e) {
      console.error("Export failed:", file.path, e);
      errors++;
    }
    progress.value = exported + errors;
  }

  // Done
  title.textContent = "Export Complete";
  fileLabel.textContent = "";
  statusText.textContent = exported + " exported" + (errors > 0 ? ", " + errors + " failed" : "");
  if (errors > 0) console.warn("Export All finished with " + errors + " error(s). Check console for details.");

  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = "margin-top:16px;padding:6px 20px;background:#3D3D3D;color:#F5F0EB;border:1px solid #4A4A4A;border-radius:4px;cursor:pointer;font-family:inherit;font-size:13px";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => document.body.removeChild(overlay));
  card.appendChild(closeBtn);
}

// ── Theme (matches branded theme from showcase) ──
const theme = {
  bg: "#2C2C2C",
  bgSecondary: "#333333",
  bgTertiary: "#3D3D3D",
  text: "#F5F0EB",
  textMuted: "#A89F95",
  textAccent: "#F5F0EB",
  border: "#4A4A4A",
  buttonBg: "#3D3D3D",
  buttonHover: "#4A4A4A",
  buttonActive: "#555555",
  accent: "#C75B39",
  accentHover: "#D4724E",
  sliderTrack: "#4A4A4A",
  sliderThumb: "#C75B39",
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontMono: "'SF Mono', 'Fira Code', monospace",
  canvasShadow: "0 4px 60px rgba(199, 91, 57, 0.12), 0 0 40px rgba(0,0,0,0.4)",
};

// ── Styles ──
const style = document.createElement("style");
style.textContent = \`
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; background: #2C2C2C; color: #F5F0EB; }
  body { font-family: 'Cormorant Garamond', Georgia, serif; }
  #studio { display: flex; height: 100vh; width: 100vw; }

  .sidebar {
    width: 260px;
    min-width: 260px;
    background: #333333;
    border-right: 1px solid #4A4A4A;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sidebar__header {
    padding: 16px 20px;
    border-bottom: 1px solid #4A4A4A;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #A89F95;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sidebar__header span {
    color: #C75B39;
    font-size: 13px;
  }
  .sidebar__list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }
  .sidebar__list::-webkit-scrollbar { width: 6px; }
  .sidebar__list::-webkit-scrollbar-track { background: transparent; }
  .sidebar__list::-webkit-scrollbar-thumb { background: #4A4A4A; border-radius: 3px; }

  .sidebar__folder {
    padding: 10px 20px 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #A89F95;
  }
  .sidebar__item {
    padding: 8px 20px 8px 28px;
    font-size: 13px;
    cursor: pointer;
    color: #A89F95;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11.5px;
  }
  .sidebar__item:hover { background: #363636; color: #F5F0EB; }
  .sidebar__item--active {
    background: rgba(199, 91, 57, 0.12) !important;
    color: #C75B39 !important;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .main__status {
    height: 32px;
    min-height: 32px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    background: #333333;
    border-bottom: 1px solid #4A4A4A;
    font-size: 11px;
    color: #A89F95;
    font-family: 'SF Mono', 'Fira Code', monospace;
    gap: 12px;
  }
  .main__status .save-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    transition: opacity 0.3s;
  }
  .main__status .save-indicator--saving { color: #C75B39; }
  .main__status .save-indicator--saved { color: #6B8E6B; }
  .main__status .save-indicator--error {
    color: #E25C5C;
    cursor: pointer;
    text-decoration: underline dotted;
  }
  .main__status .save-indicator--error:hover { color: #FF7777; }
  .main__editor {
    flex: 1;
    overflow: hidden;
  }
  .main__empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #A89F95;
    font-size: 18px;
  }

  /* ── Bridge toast (LLM mutation attribution) ── */
  .atel-toast-host {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .atel-toast {
    background: #333333;
    border: 1px solid #C75B39;
    color: #F5F0EB;
    padding: 10px 14px;
    border-radius: 6px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 200ms ease, transform 200ms ease;
    pointer-events: auto;
    max-width: 360px;
  }
  .atel-toast--visible { opacity: 1; transform: translateY(0); }
  .atel-toast__hint { color: #A89F95; margin-left: 6px; font-size: 11px; }
\`;
document.head.appendChild(style);

// ── Build UI ──
const root = document.getElementById("studio")!;
const sidebar = document.createElement("div");
sidebar.className = "sidebar";

const sidebarHeader = document.createElement("div");
sidebarHeader.className = "sidebar__header";
sidebarHeader.innerHTML = '<span>&#9670;</span> ATELIER STUDIO';
sidebar.appendChild(sidebarHeader);

const sidebarList = document.createElement("div");
sidebarList.className = "sidebar__list";
sidebar.appendChild(sidebarList);

const sidebarFooter = document.createElement("div");
sidebarFooter.style.cssText = "padding:12px 16px;border-top:1px solid #4A4A4A;display:flex;gap:8px;align-items:center";
const exportAllSelect = document.createElement("select");
exportAllSelect.style.cssText = "flex:1;background:#3D3D3D;color:#F5F0EB;border:1px solid #4A4A4A;border-radius:4px;padding:4px 8px;font-size:11px;font-family:'SF Mono','Fira Code',monospace;cursor:pointer";
for (const [val, label] of [["gif","GIF"],["mp4","MP4"],["webm","WebM"]] as const) {
  const o = document.createElement("option");
  o.value = val;
  o.textContent = label;
  exportAllSelect.appendChild(o);
}
sidebarFooter.appendChild(exportAllSelect);
const exportAllBtn = document.createElement("button");
exportAllBtn.style.cssText = "background:#C75B39;color:#F5F0EB;border:none;border-radius:4px;padding:5px 12px;font-size:11px;font-family:inherit;cursor:pointer;white-space:nowrap";
exportAllBtn.textContent = "Export All";
exportAllBtn.addEventListener("click", () => {
  exportAll(exportAllSelect.value as "gif" | "mp4" | "webm");
});
sidebarFooter.appendChild(exportAllBtn);
sidebar.appendChild(sidebarFooter);

const main = document.createElement("div");
main.className = "main";

const statusBar = document.createElement("div");
statusBar.className = "main__status";
main.appendChild(statusBar);

const editorContainer = document.createElement("div");
editorContainer.className = "main__editor";
main.appendChild(editorContainer);

root.appendChild(sidebar);
root.appendChild(main);

// ── File list rendering ──
function renderFileList(): void {
  sidebarList.innerHTML = "";
  let lastFolder = "";

  for (const file of files) {
    if (file.folder && file.folder !== lastFolder) {
      lastFolder = file.folder;
      const folder = document.createElement("div");
      folder.className = "sidebar__folder";
      folder.textContent = file.folder;
      sidebarList.appendChild(folder);
    }

    const item = document.createElement("div");
    item.className = "sidebar__item" + (file.path === currentFile ? " sidebar__item--active" : "");
    item.textContent = file.name;
    item.title = file.path;
    item.addEventListener("click", () => loadFile(file.path));
    sidebarList.appendChild(item);
  }
}

// ── Load a file into the studio ──
async function loadFile(path: string): Promise<void> {
  currentFile = path;
  renderFileList();

  const content = await fetchFileContent(path);
  const result = parseAtelier(content);

  if (!result.success) {
    editorContainer.innerHTML = "";
    const err = document.createElement("div");
    err.className = "main__empty";
    err.style.flexDirection = "column";
    err.style.gap = "8px";
    err.innerHTML = '<div style="color:#C75B39">Parse Error</div><div style="font-size:13px;font-family:monospace">' +
      result.errors.map(e => e.path + ": " + e.message).join("<br>") + "</div>";
    editorContainer.appendChild(err);
    return;
  }

  statusBar.innerHTML = '<span>' + path + '</span><span class="save-indicator save-indicator--saved">&#10003; saved</span>';

  if (studio) {
    studio.destroy();
    studio = null;
  }

  // Set filename for export downloads (strip path and .atelier extension)
  const baseName = path.split("/").pop()?.replace(/\\.atelier$/, "") || null;

  // Closure state for save status + retry affordance.
  // Tracks the most recently-attempted payload so a retry click re-sends
  // the same bytes (the user may have kept editing in the meantime, but
  // they're retrying THE failed save).
  let lastPendingContent: string | null = null;
  let lastPendingPath: string | null = null;

  function setSavedIndicator(): void {
    const ind = statusBar.querySelector(".save-indicator") as HTMLElement | null;
    if (!ind) return;
    ind.className = "save-indicator save-indicator--saved";
    ind.innerHTML = "&#10003; saved";
    ind.title = "";
    ind.onclick = null;
  }

  function setSavingIndicator(): void {
    const ind = statusBar.querySelector(".save-indicator") as HTMLElement | null;
    if (!ind) return;
    ind.className = "save-indicator save-indicator--saving";
    ind.innerHTML = "&#9679; saving...";
    ind.title = "";
    ind.onclick = null;
  }

  function setErrorIndicator(message: string): void {
    const ind = statusBar.querySelector(".save-indicator") as HTMLElement | null;
    if (!ind) return;
    ind.className = "save-indicator save-indicator--error";
    ind.innerHTML = "&#9888; Save failed: " + escapeHtml(message) + " (click to retry)";
    ind.title = "Click to retry save";
    ind.onclick = () => { retrySave(); };
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function performSave(path: string, content: string): Promise<void> {
    lastPendingPath = path;
    lastPendingContent = content;
    setSavingIndicator();
    try {
      await saveFileContent(path, content);
      // Only clear error state if this save corresponds to the latest attempt
      if (lastPendingPath === path && lastPendingContent === content) {
        lastPendingContent = null;
        lastPendingPath = null;
      }
      setSavedIndicator();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Save failed:", msg);
      setErrorIndicator(msg);
    }
  }

  async function retrySave(): Promise<void> {
    if (!lastPendingPath || lastPendingContent === null) return;
    await performSave(lastPendingPath, lastPendingContent);
  }

  studio = new AtelierStudio(editorContainer, {
    mode: "full",
    initialTab: "yaml",
    allowSave: true,
    onDocumentChange: (doc) => {
      // Auto-save with debounce — flip to "saving" immediately so the user
      // knows their edit was registered even while the timeout is pending.
      setSavingIndicator();

      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (!currentFile) return;
        const yaml = serializeAtelier(doc);
        void performSave(currentFile, yaml);
      }, 800);

      // Bridge: send the human edit so any connected MCP client (or future
      // bridge listeners) sees the doc as-edited. The server marks this as
      // source:"human" so the bridge does NOT echo back.
      if (!suppressOutbound && bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN && currentFile) {
        try {
          bridgeSocket.send(JSON.stringify({
            type: "doc:patch",
            documentId: currentFile,
            doc,
            source: "human",
          }));
        } catch {
          // Bridge transport failure is non-fatal — autosave still covers persistence.
        }
      }
    },
  });
  studio.setTheme(theme);
  studio.setFilename(baseName);
  studio.loadDocument(result.data);
}

// ── Toast (LLM mutation attribution) ──
const toastHost = document.createElement("div");
toastHost.className = "atel-toast-host";
document.body.appendChild(toastHost);

function showToast(message: string, hint?: string): void {
  const toast = document.createElement("div");
  toast.className = "atel-toast";
  toast.textContent = message;
  if (hint) {
    const span = document.createElement("span");
    span.className = "atel-toast__hint";
    span.textContent = hint;
    toast.appendChild(span);
  }
  toastHost.appendChild(toast);
  // Trigger transition next frame.
  requestAnimationFrame(() => { toast.classList.add("atel-toast--visible"); });
  setTimeout(() => {
    toast.classList.remove("atel-toast--visible");
    setTimeout(() => { toast.remove(); }, 250);
  }, 3200);
}

// ── Bridge connection (LLM ↔ human live mutation loop) ──
//
// Manual test:
//   1. Run \`atelier studio\` in a directory with a .atelier file.
//   2. In another terminal, run an MCP client (e.g. Claude Desktop with the
//      atelier-mcp server configured to connect to ws://127.0.0.1:<port>/mcp).
//   3. Ask the LLM to add a layer, change a color, etc.
//   4. Watch the studio canvas update in real time and a toast appear in
//      the bottom-right reading "agent edited document (<tool>) — Cmd-Z to undo".
//   5. Hit Cmd-Z; the prior state returns. The history snapshot was made
//      by studio.applyMutation() (see Builder F's commit 0219d28).
//
// Playwright e2e coverage is task #15.3 — deferred per the testing strategy.
function connectBridge(): void {
  if (bridgeSocket && bridgeSocket.readyState !== WebSocket.CLOSED) return;
  const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/bridge";
  try {
    bridgeSocket = new WebSocket(url);
  } catch (err) {
    console.warn("Bridge connect failed:", err);
    return;
  }

  bridgeSocket.addEventListener("message", (ev) => {
    let env: any;
    try { env = JSON.parse(ev.data); } catch { return; }

    if (env.type === "hello") {
      // Logged for parity with the server's clientId — useful when debugging.
      console.debug("[bridge] connected as", env.clientId, "protocol v" + env.protocolVersion);
      return;
    }

    if (env.type === "doc:loaded") {
      // The bridge sent us its current doc on connect. Only apply if we
      // either have no doc loaded yet OR the bridge's doc id matches what
      // we're showing — otherwise the user just switched files in the
      // sidebar and the bridge will catch up via /api/file.
      if (studio && currentFile === env.documentId) {
        suppressOutbound = true;
        try { studio.applyMutation({ type: "doc:replace", doc: env.doc, source: "system" }); }
        finally { queueMicrotask(() => { suppressOutbound = false; }); }
      }
      return;
    }

    if (env.type === "llm:mutation") {
      if (studio && currentFile === env.documentId) {
        suppressOutbound = true;
        try {
          studio.applyMutation({ type: "doc:replace", doc: env.doc, source: env.source ?? "llm" });
        } finally {
          queueMicrotask(() => { suppressOutbound = false; });
        }
        const tool = env.toolName ? "(" + env.toolName + ")" : "(MCP tool)";
        showToast("agent edited document " + tool, " — Cmd-Z to undo");
      }
      return;
    }

    if (env.type === "error") {
      console.warn("[bridge] error:", env.code, env.message);
      return;
    }
  });

  bridgeSocket.addEventListener("close", () => {
    // Auto-reconnect after a short delay so the studio survives transient
    // dev-server reloads. Bounded retry would be nice in v1.1.
    setTimeout(connectBridge, 1000);
  });

  bridgeSocket.addEventListener("error", () => {
    // close handler will fire next and trigger the reconnect.
  });
}

// ── Boot ──
async function boot(): Promise<void> {
  files = await fetchFiles();

  if (files.length === 0) {
    editorContainer.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "main__empty";
    empty.style.flexDirection = "column";
    empty.style.gap = "10px";
    empty.style.textAlign = "center";
    empty.style.padding = "40px";
    empty.innerHTML = '<div style="font-size:16px;color:#F5F0EB">No .atelier files yet</div>' +
      '<div style="font-size:13px;color:#A89F95;font-family:monospace">Drop a .atelier file here, or run: <code>atelier studio --new</code></div>';
    editorContainer.appendChild(empty);
    statusBar.textContent = "No files";
    renderFileList();
    return;
  }

  renderFileList();

  const initialFile = ${initialFileStr};
  const target = initialFile
    ? files.find(f => f.path === initialFile || f.path.endsWith(initialFile))
    : files[0];

  if (target) {
    await loadFile(target.path);
  }
}

boot();
connectBridge();
`;
}

/**
 * Locate the CLI package directory regardless of whether this module is
 * running from `dist/cli.js` (production) or `src/commands/studio.ts` (dev).
 *
 * In production: this file is `dist/cli.js`, so `..` from its dirname
 * resolves to the package root.
 * In dev (vitest, ts-node): this file is `src/commands/studio.ts`, so
 * we need to climb two levels.
 *
 * We probe for a recognisable file (package.json) at each candidate.
 */
function resolveCliPackageDir(): string {
  const here = dirname(new URL(import.meta.url).pathname);
  const candidates = [
    resolve(here, ".."),
    resolve(here, "..", ".."),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "package.json"))) {
      return c;
    }
  }
  // Fall back to first candidate; downstream callers handle missing files.
  return candidates[0];
}

/**
 * If `cwd` contains zero `.atelier` files, copy the bundled welcome template
 * (and any sibling assets) into `cwd`. Skips files that already exist so a
 * user re-running the command never overwrites their work.
 *
 * Returns the basename of the scaffolded file (or null if nothing was done).
 */
function scaffoldWelcomeIfEmpty(cwd: string, cliPackageDir: string): string | null {
  const existing = findAtelierFiles(cwd);
  if (existing.length > 0) return null;

  const templatesDir = join(cliPackageDir, "templates");
  const welcomeSrc = join(templatesDir, "welcome.atelier");
  if (!existsSync(welcomeSrc)) return null;

  const welcomeDest = join(cwd, "welcome.atelier");
  if (existsSync(welcomeDest)) return null;

  try {
    copyFileSync(welcomeSrc, welcomeDest);
  } catch {
    // Non-fatal: studio still launches with empty-state UI.
    return null;
  }

  // Also copy welcome-bg.png if shipped alongside (currently we ship a
  // ShapeVisual placeholder, so this is a no-op; future-proofs the path).
  const bgSrc = join(templatesDir, "welcome-bg.png");
  if (existsSync(bgSrc)) {
    const bgDest = join(cwd, "welcome-bg.png");
    if (!existsSync(bgDest)) {
      try {
        copyFileSync(bgSrc, bgDest);
      } catch {
        // Non-fatal.
      }
    }
  }

  return "welcome.atelier";
}

/** Read the CLI package version for display in the splash banner. */
function readCliVersion(cliPackageDir: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(cliPackageDir, "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

/** Register the `studio` subcommand on the Commander program. */
export function studioCommand(program: Command): void {
  program
    .command("studio [file]")
    .description("Launch the browser-based Atelier editor")
    .option("-p, --port <number>", "Port to serve on", "4321")
    .option("--no-open", "Don't auto-open browser")
    .action(
      async (
        file: string | undefined,
        options: { port: string; open: boolean },
      ) => {
        const port = parseInt(options.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          console.error(`Invalid port: ${options.port}`);
          process.exit(1);
        }

        const cwd = process.cwd();

        // Find the CLI package directory (where node_modules + templates live).
        const cliPackageDir = resolveCliPackageDir();
        const version = readCliVersion(cliPackageDir);

        // First-run scaffold: if CWD has zero .atelier files, drop in welcome.atelier
        // so the user lands on something real instead of an empty-state dead-end.
        const scaffolded = scaffoldWelcomeIfEmpty(cwd, cliPackageDir);

        console.log("");
        console.log(`  Atelier Studio · v${version}`);
        if (scaffolded) {
          console.log(`   Scaffolded ${scaffolded} — opening…`);
        }

        // Create temp directory with inline app.
        // Use realpathSync to resolve macOS /var -> /private/var symlink,
        // which Vite normalizes internally when resolving file paths.
        const tmpId = randomBytes(4).toString("hex");
        const tmpDirRaw = join(tmpdir(), `atelier-studio-${tmpId}`);
        mkdirSync(tmpDirRaw, { recursive: true });
        const tmpDir = realpathSync(tmpDirRaw);

        writeFileSync(join(tmpDir, "index.html"), getInlineHTML());
        writeFileSync(join(tmpDir, "main.ts"), getInlineApp(file ?? null));

        // Symlink node_modules into temp dir so Vite can resolve @a-company/* packages.
        // Works for both monorepo (pnpm workspace links) and npm global install.
        const cliNodeModules = join(cliPackageDir, "node_modules");
        if (existsSync(cliNodeModules)) {
          try {
            symlinkSync(cliNodeModules, join(tmpDir, "node_modules"), "dir");
          } catch {
            // Non-fatal: aliases will handle resolution if symlink fails
          }
        }

        console.log(`  Working directory: ${cwd}`);

        // Dynamically import Vite (it's a peer/optional dep)
        let vite: typeof import("vite");
        try {
          vite = await import("vite");
        } catch {
          console.error("Vite is required for `atelier studio`.");
          console.error("Install it: pnpm add -D vite");
          process.exit(1);
          return;
        }

        // ^localhost-only: bind explicitly to the loopback interface so the
        // dev server cannot be reached from other machines on the network.
        // Vite's default is "localhost" which already resolves to loopback,
        // but we pin 127.0.0.1 to make the invariant intentional + auditable
        // and to defeat any future change in Vite defaults.
        const HOSTNAME = "127.0.0.1";

        // Shared session state for the bridge + MCP-over-WS endpoints.
        // The same DocumentStore is fed by:
        //   - File reads via /api/file (source:"system" — hydrates the cache)
        //   - File writes via /api/file POST (source:"human" — no broadcast)
        //   - Bridge doc:patch (source:"human" — no broadcast; also persists)
        //   - Per-connection MCP servers over /mcp (source:"llm" by default
        //     for tools that don't tag — broadcasts to the bridge)
        const bridgeState: BridgeSessionState = {
          store: new DocumentStore(),
          currentDocId: null,
        };
        const bridgeClients = new Set<WsWebSocket>();

        const loadDocFromDisk = (docId: string): string | null => {
          if (!isSafePath(docId)) return null;
          try {
            return readFileSync(resolve(cwd, docId), "utf-8");
          } catch {
            return null;
          }
        };

        const persistHumanPatch = (
          docId: string,
          doc: import("@a-company/atelier-types").AtelierDocument,
        ): void => {
          if (!isSafePath(docId)) return;
          writeFileSync(resolve(cwd, docId), serializeAtelier(doc), "utf-8");
        };

        // Persist LLM/system mutations to disk so the on-disk .atelier file
        // stays in lock-step with what the browser shows. Without this, a
        // refresh would lose the LLM's edits.
        bridgeState.store.onChange((id, doc, source) => {
          if (source === "human") return; // already persisted by /api/file POST
          if (doc === null) return;       // deletions don't touch disk in v1
          try {
            persistHumanPatch(id, doc);
          } catch {
            // Non-fatal: in-memory state is authoritative for the browser session.
          }
          broadcastToBridge(bridgeClients, {
            type: "llm:mutation",
            documentId: id,
            doc,
            source,
          });
        });

        const server = await vite.createServer({
          root: tmpDir,
          server: {
            host: HOSTNAME,
            port,
            strictPort: false,
            fs: {
              strict: false,
            },
          },
          plugins: [
            {
              name: "atelier-api",
              configureServer(server) {
                // ^localhost-only: Origin check on mutating endpoints.
                // Without this, any browser tab on any site can fire
                // fetch('http://localhost:4321/api/file', { method: 'POST', ... })
                // and write .atelier files into the user's CWD.
                // Only allow Origins that match this server's own loopback host.
                const allowedOrigins = new Set([
                  `http://localhost:${port}`,
                  `http://127.0.0.1:${port}`,
                ]);
                const MUTATING = new Set(["POST", "PUT", "DELETE", "PATCH"]);

                server.middlewares.use((req, res, next) => {
                  const url = new URL(req.url ?? "/", `http://${HOSTNAME}:${port}`);

                  if (req.method && MUTATING.has(req.method) && url.pathname.startsWith("/api/")) {
                    const origin = req.headers.origin;
                    if (!origin || !allowedOrigins.has(origin)) {
                      res.statusCode = 403;
                      res.end("Forbidden: cross-origin mutating request rejected");
                      return;
                    }
                  }

                  if (url.pathname === "/api/files") {
                    const atelierFiles = findAtelierFiles(cwd);
                    const entries = atelierFiles.map((p) => {
                      const parts = p.split("/");
                      return {
                        path: p,
                        name: parts[parts.length - 1].replace(".atelier", ""),
                        folder: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
                      };
                    });
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify(entries));
                    return;
                  }

                  if (url.pathname === "/api/file") {
                    const filePath = url.searchParams.get("path");
                    if (!filePath || !isSafePath(filePath)) {
                      res.statusCode = 400;
                      res.end("Invalid path");
                      return;
                    }

                    const absPath = resolve(cwd, filePath);

                    if (req.method === "GET") {
                      try {
                        const content = readFileSync(absPath, "utf-8");
                        // Mirror into the shared store so MCP clients connecting
                        // over /mcp see the same active document and the bridge
                        // can broadcast it to late-joining browser clients.
                        const parsed = parseAtelier(content);
                        if (parsed.success) {
                          bridgeState.store.set(filePath, parsed.data, "system");
                          bridgeState.currentDocId = filePath;
                        }
                        res.setHeader("Content-Type", "text/plain");
                        res.end(content);
                      } catch {
                        res.statusCode = 404;
                        res.end("File not found");
                      }
                      return;
                    }

                    if (req.method === "POST") {
                      let body = "";
                      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
                      req.on("end", () => {
                        try {
                          writeFileSync(absPath, body, "utf-8");
                          // Mirror human writes into the store with source:"human"
                          // so onChange skips re-broadcasting (the browser already
                          // has the latest — no echo needed).
                          const parsed = parseAtelier(body);
                          if (parsed.success) {
                            bridgeState.store.set(filePath, parsed.data, "human");
                            bridgeState.currentDocId = filePath;
                          }
                          res.end("OK");
                        } catch (e) {
                          const msg = e instanceof Error ? e.message : String(e);
                          res.statusCode = 500;
                          res.end(msg);
                        }
                      });
                      return;
                    }
                  }

                  if (url.pathname === "/api/export" && req.method === "POST") {
                    const filePath = url.searchParams.get("path");
                    if (!filePath || !isSafePath(filePath)) {
                      res.statusCode = 400;
                      res.end("Invalid path");
                      return;
                    }

                    const absPath = resolve(cwd, filePath);
                    const chunks: Buffer[] = [];
                    req.on("data", (chunk: Buffer) => { chunks.push(chunk); });
                    req.on("end", () => {
                      try {
                        mkdirSync(dirname(absPath), { recursive: true });
                        writeFileSync(absPath, Buffer.concat(chunks));
                        res.end("OK");
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        res.statusCode = 500;
                        res.end(msg);
                      }
                    });
                    return;
                  }

                  if (url.pathname === "/api/cwd") {
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ cwd }));
                    return;
                  }

                  next();
                });
              },
            },
          ],
          logLevel: "warn",
        });

        await server.listen();

        // Mount WebSocket bridge + MCP transport on Vite's HTTP server.
        // ^localhost-only: the connect middleware does NOT run on WS upgrades
        // (Node fires 'upgrade' before connect), so we re-run the Origin
        // check here. Without this the bridge would be cross-origin-reachable
        // from any browser tab.
        const httpServer = server.httpServer;
        if (httpServer) {
          const wssBridge = new WebSocketServer({ noServer: true });
          const wssMcp = new WebSocketServer({ noServer: true });

          httpServer.on("upgrade", (req, socket, head) => {
            const url = new URL(req.url ?? "/", `http://${HOSTNAME}:${port}`);
            if (url.pathname !== "/bridge" && url.pathname !== "/mcp") return;

            // ^localhost-only Origin check for WS upgrades.
            if (!isAllowedOrigin(req.headers.origin, port)) {
              socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
              socket.destroy();
              return;
            }

            if (url.pathname === "/bridge") {
              wssBridge.handleUpgrade(req, socket, head, (ws) => {
                wssBridge.emit("connection", ws, req);
              });
              return;
            }

            // url.pathname === "/mcp"
            wssMcp.handleUpgrade(req, socket, head, (ws) => {
              wssMcp.emit("connection", ws, req);
            });
          });

          wssBridge.on("connection", (ws) => {
            attachBridgeClient(
              ws,
              bridgeState,
              bridgeClients,
              loadDocFromDisk,
              persistHumanPatch,
            );
          });

          wssMcp.on("connection", (ws) => {
            // Per-connection MCP server, shared store. Each external client
            // gets its own handler context but writes flow through the same
            // emitter the bridge subscribes to.
            const { server: mcpServer } = createMcpServer(bridgeState.store);
            const transport = new WebSocketServerTransport(ws);
            mcpServer.connect(transport).catch((err) => {
              // Connection-time failures: log and close. Per-call failures
              // surface as JSON-RPC errors via the SDK.
              console.error("MCP-over-WS connect failed:", err);
              try { ws.close(); } catch { /* ignore */ }
            });
          });
        }

        const resolvedUrl = server.resolvedUrls?.local[0] ?? `http://localhost:${port}`;
        const url = resolvedUrl;

        console.log(`  Server running at: ${url}`);

        const atelierFiles = findAtelierFiles(cwd);
        console.log(`  Found ${atelierFiles.length} .atelier file(s)`);

        if (file) {
          console.log(`  Opening: ${file}`);
        }

        console.log(`  Press Ctrl+C to stop\n`);

        if (options.open) {
          exec(`open "${url}"`);
        }

        // Keep alive and handle cleanup
        const cleanup = () => {
          console.log("\nShutting down...");
          server.close();
          try {
            rmSync(tmpDir, { recursive: true, force: true });
          } catch {
            // ignore cleanup errors
          }
          process.exit(0);
        };

        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
      },
    );
}
