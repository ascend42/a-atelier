/**
 * #studio-inline-app — the browser-side Atelier Studio client.
 *
 * This was previously a ~700-LOC template-literal STRING returned by
 * `getInlineApp()` in `src/commands/studio.ts`: no typecheck, no lint, no
 * tests. Two real bugs (the autosave save-race and the slider-commit flood)
 * hid there precisely because the compiler never saw it.
 *
 * It now lives here as REAL TypeScript, typechecked against the DOM lib via
 * `src/web/tsconfig.json` (the surrounding `src/` is a node project; mixing
 * DOM + node globals in one tsconfig clashes, so `web/` is isolated — mirrors
 * how the `@a-company/atelier-studio` package scopes DOM).
 *
 * The studio command writes a tiny entry shim into its temp dir that imports
 * `bootStudioApp` from this file (by absolute path under the CLI package) and
 * calls it with the injected `{ initialFile }`. Vite's dev server transpiles
 * + serves this module directly from source at request time.
 *
 * BEHAVIOR IS A BYTE-FOR-BEHAVIOR EXTRACTION of the old string — no logic
 * changes. The manual debounce autosave (NOT the `SaveCoordinator` class) is
 * preserved verbatim, including the path/bytes capture + flush-on-switch that
 * fixed the cross-file corruption bug.
 *
 * NOTE: do NOT `import` this file from any tsup entry (`src/index.ts`,
 * `src/cli.ts`) — it must stay reachable only as a string path, or tsup will
 * try to bundle DOM code into the node build. The CLI ships it as raw source
 * via the package `files: ["src/web/**"]` glob.
 */

import { AtelierStudio, exportDocument, ImageCache } from "@a-company/atelier-studio";
import "@a-company/atelier-studio/styles.css";
import { parseAtelier, serializeAtelier } from "@a-company/atelier-schema";

type AtelierDoc = import("@a-company/atelier-types").AtelierDocument;

// TYPE-SKEW / RUNTIME BUG SURFACED BY THIS EXTRACTION:
// The CLI resolves @a-company/atelier-studio via the registry range
// ">=0.25.1", which pnpm pinned to 0.26.1 — and 0.26.1 ships NEITHER the
// `applyMutation` method nor its type (it was added in workspace 0.27.0, see
// "Builder F's commit 0219d28"). The bridge's `llm:mutation` / `doc:loaded`
// handlers below CALL `studio.applyMutation(...)`, so they throw
// `TypeError: studio.applyMutation is not a function` at runtime whenever an
// LLM mutation actually arrives over the bridge. This was completely invisible
// while the client lived as an un-typechecked string.
//
// Per the extraction's scope (pure move, no behavior change) we do NOT fix the
// runtime gap here — that would mean bumping the cli's studio dep to a version
// that ships the method (or switching it to `workspace:*`), which is a real
// behavior change. We only augment the TYPE so the call typechecks; the runtime
// call is left exactly as it was so the surfaced bug is preserved, not masked.
declare module "@a-company/atelier-studio" {
  interface AtelierStudio {
    applyMutation(op: {
      type: "doc:replace";
      doc: AtelierDoc;
      source: "human" | "llm" | "system";
    }): void;
  }
}

/** Injected by the entry shim the studio command writes into its temp dir. */
export interface StudioAppConfig {
  /** Path of the file to open on boot, or null to open the first file found. */
  initialFile: string | null;
}

// ── Types ──
interface FileEntry {
  path: string;
  name: string;
  folder: string;
}

/**
 * Boot the in-browser Atelier Studio client. Wires up the file sidebar, the
 * AtelierStudio editor + autosave, image drag-drop, the WS bridge, and the
 * export-all flow. Called once by the temp-dir entry shim.
 */
export function bootStudioApp(config: StudioAppConfig): void {
  // ── State ──
  let studio: AtelierStudio | null = null;
  let currentFile: string | null = null;
  let files: FileEntry[] = [];
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  // The path + bytes the pending saveTimeout was scheduled for. Captured so a
  // fired timer (and the flush-on-switch below) writes to the file it was
  // scheduled for — NOT whatever currentFile becomes when the user switches
  // files mid-debounce. Without this, editing A then opening B within the 800ms
  // window wrote A's bytes to B's path: real .atelier corruption.
  let pendingSavePath: string | null = null;
  let pendingSaveContent: string | null = null;
  let flushPendingSave: (() => void) | null = null;
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

  // Build a minimal-but-non-empty starter document for a brand-new file.
  // One centered text layer so the canvas isn't a confusing void; 1080x1080
  // to match the social-square default the welcome template uses.
  function newStarterDoc(title: string) {
    return {
      version: "1.0",
      name: title,
      canvas: { width: 1080, height: 1080, fps: 30, background: "#0F1115" },
      layers: [
        {
          id: "title",
          visual: {
            type: "text",
            content: title,
            style: {
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 72,
              fontWeight: 600,
              color: "#F5F0EB",
              textAlign: "center",
            },
          },
          frame: { x: 540, y: 540 },
          bounds: { width: 900, height: 120 },
          anchorPoint: { x: 0.5, y: 0.5 },
        },
      ],
      states: { default: { duration: 60, deltas: [] } },
    };
  }

  // Create a new .atelier file in the project root, then select it.
  // The server's POST /api/file writes arbitrary safe paths, so a "new file"
  // is just a write of a fresh starter doc followed by a file-list refresh.
  async function createNewFile() {
    const raw = window.prompt("New file name", "untitled.atelier");
    if (raw === null) return; // user cancelled
    let name = raw.trim();
    if (!name) return;
    if (!name.endsWith(".atelier")) name += ".atelier";
    if (files.some((f) => f.path === name || f.name === name)) {
      window.alert('A file named "' + name + '" already exists.');
      return;
    }
    const baseName = name.replace(/\.atelier$/, "");
    // The starter-doc literal's discriminant fields (visual.type, etc.) widen
    // to `string`, so it isn't assignable to AtelierDocument as a bare literal.
    // The bytes are validated immediately below via parseAtelier, so the cast is
    // safe; this was simply never typechecked in the old string form.
    const content = serializeAtelier(newStarterDoc(baseName) as Parameters<typeof serializeAtelier>[0]);
    // Sanity-check the serialized doc round-trips before writing it to disk.
    const parsed = parseAtelier(content);
    if (!parsed.success) {
      window.alert("Could not create file (internal schema error).");
      return;
    }
    try {
      await saveFileContent(name, content);
    } catch (e) {
      window.alert("Failed to create file: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    files = await fetchFiles();
    renderFileList();
    await loadFile(name);
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

        // TYPE-SKEW: parseAtelier returns the WORKSPACE AtelierDocument, while
        // exportDocument (from @a-company/atelier-studio@0.26.1) expects the
        // AtelierDocument pinned via studio's own atelier-types dep. The two are
        // structurally identical at runtime (the workspace type merely adds the
        // "video" AssetType), so the cast is safe. Invisible in the old string.
        const exportResult = await exportDocument(
          doc as Parameters<typeof exportDocument>[0],
          canvas,
          imageCache,
          {
            format,
            onProgress: ({ percent }) => {
              statusText.textContent = (exported + errors + 1) + " / " + files.length + " — " + percent + "%";
            },
          },
        );

        // Save alongside the source file: e.g. "dir/my-anim.atelier" → "dir/my-anim.gif"
        const outPath = file.path.replace(/\.atelier$/, "." + format);
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
  style.textContent = `
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
`;
  document.head.appendChild(style);

  // ── Build UI ──
  const root = document.getElementById("studio")!;
  const sidebar = document.createElement("div");
  sidebar.className = "sidebar";

  const sidebarHeader = document.createElement("div");
  sidebarHeader.className = "sidebar__header";
  sidebarHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between";
  const sidebarTitle = document.createElement("span");
  sidebarTitle.innerHTML = '<span>&#9670;</span> ATELIER STUDIO';
  sidebarHeader.appendChild(sidebarTitle);
  const newFileBtn = document.createElement("button");
  newFileBtn.textContent = "+ New";
  newFileBtn.title = "Create a new .atelier file";
  newFileBtn.style.cssText = "background:#3D3D3D;color:#F5F0EB;border:1px solid #4A4A4A;border-radius:4px;padding:3px 10px;font-size:11px;font-family:inherit;cursor:pointer";
  newFileBtn.addEventListener("click", () => { createNewFile(); });
  sidebarHeader.appendChild(newFileBtn);
  sidebar.appendChild(sidebarHeader);

  const sidebarList = document.createElement("div");
  sidebarList.className = "sidebar__list";
  sidebar.appendChild(sidebarList);

  const sidebarFooter = document.createElement("div");
  sidebarFooter.style.cssText = "padding:12px 16px;border-top:1px solid #4A4A4A;display:flex;gap:8px;align-items:center";
  const exportAllSelect = document.createElement("select");
  exportAllSelect.style.cssText = "flex:1;background:#3D3D3D;color:#F5F0EB;border:1px solid #4A4A4A;border-radius:4px;padding:4px 8px;font-size:11px;font-family:'SF Mono','Fira Code',monospace;cursor:pointer";
  for (const [val, label] of [["gif", "GIF"], ["mp4", "MP4"], ["webm", "WebM"]] as const) {
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
    // Flush any pending autosave to its OWN file BEFORE switching. This both
    // (a) avoids dropping the user's unsaved edit to the outgoing file and
    // (b) prevents the debounce timer from later firing and writing the old
    // file's bytes to the newly-loaded file's path (.atelier corruption).
    if (flushPendingSave) flushPendingSave();
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    pendingSavePath = null;
    pendingSaveContent = null;
    flushPendingSave = null;

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
    const baseName = path.split("/").pop()?.replace(/\.atelier$/, "") || null;

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

        // Capture the target path + bytes NOW so the timer writes to the file
        // this edit belongs to, regardless of what currentFile becomes later.
        const targetPath = currentFile;
        const yaml = serializeAtelier(doc);
        pendingSavePath = targetPath;
        pendingSaveContent = yaml;

        // Register the synchronous-ish flush used by loadFile on a file switch:
        // it fires the pending save to its OWN path (fetch is async, but the
        // captured path guarantees correctness) and clears the timer.
        flushPendingSave = () => {
          if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
          if (pendingSavePath && pendingSaveContent !== null) {
            void performSave(pendingSavePath, pendingSaveContent);
          }
          pendingSavePath = null;
          pendingSaveContent = null;
        };

        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          saveTimeout = null;
          if (!targetPath) return;
          pendingSavePath = null;
          pendingSaveContent = null;
          void performSave(targetPath, yaml);
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
    // TYPE-SKEW (see exportAll above): workspace vs studio-pinned AtelierDocument
    // are structurally identical at runtime; the cast bridges the nominal gap.
    studio.loadDocument(result.data as Parameters<AtelierStudio["loadDocument"]>[0]);
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
  //   1. Run `atelier studio` in a directory with a .atelier file.
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
      let env: BridgeMessage;
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
        '<div style="font-size:13px;color:#A89F95">Create a new document, or drop a .atelier file anywhere on this window.</div>';
      const newBtn = document.createElement("button");
      newBtn.textContent = "+ New document";
      newBtn.style.cssText = "background:#C75B39;color:#F5F0EB;border:none;border-radius:4px;padding:8px 18px;font-size:13px;font-family:inherit;cursor:pointer;margin-top:6px";
      newBtn.addEventListener("click", () => { createNewFile(); });
      empty.appendChild(newBtn);
      editorContainer.appendChild(empty);
      statusBar.textContent = "No files";
      renderFileList();
      return;
    }

    renderFileList();

    const initialFile = config.initialFile;
    const target = initialFile
      ? files.find(f => f.path === initialFile || f.path.endsWith(initialFile))
      : files[0];

    if (target) {
      await loadFile(target.path);
    }
  }

  boot();
  connectBridge();
}

/**
 * Shape of the bridge WS messages the client receives, as a discriminated
 * union on `type`. Mirrors the server-side `BridgeEnvelope` union (declared in
 * @a-company/atelier-mcp) for the subset the client handles. In the old string
 * form this was `any` — exactly the kind of un-typed wire surface this
 * extraction exists to eliminate. Each variant carries only the fields the
 * matching handler reads.
 */
type BridgeMessage =
  | { type: "hello"; clientId?: string; protocolVersion?: number | string }
  | { type: "doc:loaded"; documentId: string; doc: AtelierDoc }
  | {
      type: "llm:mutation";
      documentId: string;
      doc: AtelierDoc;
      source?: "human" | "llm" | "system";
      toolName?: string;
    }
  | { type: "error"; code?: string; message?: string };
