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

import { resolve, join, relative, dirname, basename, sep } from "node:path";
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync, realpathSync, symlinkSync, existsSync, copyFileSync, createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import { createInterface } from "node:readline";
import type { Command } from "commander";
import {
  clearActiveProject,
  createWorkspace,
  findWorkspace,
  isProjectDir,
  isValidProjectName,
  hasProjectMarker,
  listProjects,
  readActiveProject,
  setActiveProject,
  type ActiveProjectFile,
  type CreateWorkspaceOptions,
} from "../lib/workspace.js";
import { createProjectInWorkspace } from "./init.js";
import { LEARNING_MODES, type LearningMode } from "../lib/learning-mode.js";
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
import {
  listProjectMedia,
  listProjectTranscripts,
  listProjectArtifacts,
  projectNameFromPath,
} from "../lib/workspace-project-info.js";
import { composeVideoProject, readAtelierDoc, slugifyBasename } from "../lib/compose-video-project.js";
import { routeIngest, routeIngestWithTarget } from "../lib/ingest-dispatch.js";
// ── v1.0 media-bin pivot (Kit-A) ──
import { isValidMediaRefPath } from "../lib/ingest-bin-types.js";
import { transcribeMediaToBin } from "../lib/transcribe-orchestrator.js";
import {
  AUDIO_TRACK_ID,
  ensureClipLayer,
  recomputeTimeline,
} from "../lib/timeline-ops.js";
import { probeDuration } from "../lib/silence-detect.js";
import type { AtelierDocument, ProjectKind } from "@a-company/atelier-types";
import {
  cascadeDeleteMedia,
  deleteProject,
  deleteWorkspaceFile,
} from "../lib/workspace-delete.js";
import {
  renameMedia,
  isValidMediaBasenameForRename,
  type RenameMediaResult,
} from "../lib/rename-media.js";
// ── doc-management v1.0.x HTTP ──────
import {
  isValidDocName,
  type DocKind,
} from "../lib/doc-management-types.js";
import {
  createDoc,
  duplicateDoc,
  deleteDoc,
  listDocs,
} from "../lib/doc-management.js";

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

/**
 * Validate that a file path is safe (relative, contained within cwd).
 *
 * Rejects absolute inputs and any path that resolves outside the current
 * working directory. The containment test uses an exact-or-trailing-separator
 * prefix match so a sibling directory whose name merely starts with cwd
 * (e.g. cwd `/a/proj` vs resolved `/a/project-x`) is NOT treated as inside.
 * We intentionally do NOT reject a literal ".." substring — that blocks legit
 * names like `my..backup.atelier` while adding no real security (the resolved
 * containment check is the actual guard).
 */
export function isSafePath(filePath: string): boolean {
  if (!filePath || filePath.startsWith("/")) return false;
  const cwd = process.cwd();
  const resolved = resolve(cwd, filePath);
  return resolved === cwd || resolved.startsWith(cwd + sep);
}

/**
 * Write a file, creating any missing parent directories first. Used by the
 * POST /api/file handler so creating e.g. `notes/foo.atelier` in a subfolder
 * doesn't ENOENT (mirrors what the /api/export handler already did).
 */
export function writeFileEnsuringDir(absPath: string, body: string): void {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, body, "utf-8");
}

/**
 * Decide how to serve a file: as a UTF-8 text response (with a sensible mime
 * type) or as a binary stream. Drives `/api/file` so the workspace UI can
 * preview videos, images, audio in a `<video>` / `<img>` / `<audio>` element
 * directly via the same endpoint that serves DESIGN.md and project.atelier.
 *
 * Extension list mirrors the slot-kind extension map used by mind-map.ts and
 * media-project.ts so a file the media-list endpoint surfaces is the same
 * file the preview can play.
 */
export function getFileServeKind(
  absPath: string,
): { kind: "text"; mime: string } | { kind: "binary"; mime: string } {
  const ext = absPath.toLowerCase().match(/\.[^./\\]+$/)?.[0] ?? "";
  switch (ext) {
    // Atelier docs + plain config
    case ".atelier": return { kind: "text", mime: "application/json; charset=utf-8" };
    case ".md":      return { kind: "text", mime: "text/markdown; charset=utf-8" };
    case ".yaml":
    case ".yml":     return { kind: "text", mime: "application/yaml; charset=utf-8" };
    case ".json":    return { kind: "text", mime: "application/json; charset=utf-8" };
    case ".txt":     return { kind: "text", mime: "text/plain; charset=utf-8" };
    case ".svg":     return { kind: "text", mime: "image/svg+xml" };
    // Video
    case ".mp4":     return { kind: "binary", mime: "video/mp4" };
    case ".mov":     return { kind: "binary", mime: "video/quicktime" };
    case ".webm":    return { kind: "binary", mime: "video/webm" };
    case ".mkv":     return { kind: "binary", mime: "video/x-matroska" };
    // Audio
    case ".mp3":     return { kind: "binary", mime: "audio/mpeg" };
    case ".wav":     return { kind: "binary", mime: "audio/wav" };
    case ".m4a":     return { kind: "binary", mime: "audio/mp4" };
    case ".ogg":     return { kind: "binary", mime: "audio/ogg" };
    case ".flac":    return { kind: "binary", mime: "audio/flac" };
    // Image
    case ".png":     return { kind: "binary", mime: "image/png" };
    case ".jpg":
    case ".jpeg":    return { kind: "binary", mime: "image/jpeg" };
    case ".gif":     return { kind: "binary", mime: "image/gif" };
    case ".webp":    return { kind: "binary", mime: "image/webp" };
    case ".avif":    return { kind: "binary", mime: "image/avif" };
    // Font
    case ".ttf":     return { kind: "binary", mime: "font/ttf" };
    case ".otf":     return { kind: "binary", mime: "font/otf" };
    case ".woff":    return { kind: "binary", mime: "font/woff" };
    case ".woff2":   return { kind: "binary", mime: "font/woff2" };
    // Default — treat as text/plain to preserve back-compat with anything the
    // previous endpoint returned as text. (.atelier docs predominate here.)
    default:         return { kind: "text", mime: "text/plain; charset=utf-8" };
  }
}

/**
 * Stream a binary file with proper Content-Type + Range support so
 * <video>/<audio> elements can seek. If the request includes a `Range:
 * bytes=START-END` header we respond 206 Partial Content with the requested
 * slice; otherwise we send the whole file as 200.
 *
 * Synchronous statSync + createReadStream is fine for the localhost-only
 * use case — the studio runs alongside the creator's working session, not
 * as a high-throughput server.
 */
export function serveBinaryFile(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  absPath: string,
  mime: string,
): void {
  // statSync + createReadStream are top-level imports — using `require()` in
  // tsup's ESM output gets shim'd to `__require()` which can silently return
  // undefined and break the call. Top-level import is the safe path.
  let stat: import("node:fs").Stats;
  try {
    stat = statSync(absPath);
  } catch {
    res.statusCode = 404;
    res.end("File not found");
    return;
  }
  const size = stat.size;
  const rangeHeader = (req.headers["range"] as string | undefined) ?? "";
  const rangeMatch = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);

  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = rangeMatch[2].length > 0 ? parseInt(rangeMatch[2], 10) : size - 1;
    if (isNaN(start) || isNaN(end) || start > end || end >= size) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${size}`);
      res.end();
      return;
    }
    const chunkSize = end - start + 1;
    res.statusCode = 206;
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", String(chunkSize));
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Accept-Ranges", "bytes");
    createReadStream(absPath, { start, end }).pipe(res);
    return;
  }

  // No range header — send the whole file.
  res.statusCode = 200;
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", String(size));
  res.setHeader("Accept-Ranges", "bytes");
  createReadStream(absPath).pipe(res);
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

/**
 * Origin check for the /mcp WS upgrade. Unlike /bridge (a real browser origin),
 * non-browser MCP clients (Claude Desktop, etc.) send NO Origin header — under
 * the strict isAllowedOrigin check they'd all 403 and the MCP-over-WS feature
 * would be unreachable. So we tolerate a MISSING Origin here but still reject a
 * PRESENT-but-foreign one (a browser tab on evil.com still can't reach /mcp).
 * The loopback bind remains the primary protection.
 */
export function isAllowedMcpOrigin(origin: string | undefined, port: number): boolean {
  return origin === undefined || isAllowedOrigin(origin, port);
}

/**
 * Decide whether a store change should be broadcast to the browser (as an
 * `llm:mutation` envelope) AND re-persisted to disk. Only LLM/agent edits
 * qualify: "system" (GET-hydration of a file the user just opened) and "human"
 * (the browser is already current) must stay silent — otherwise a plain
 * file-open would fire a phantom "agent edited document" toast + bogus undo
 * entry and needlessly rewrite the just-read bytes back to disk.
 */
export function shouldBroadcastMutation(source: string): boolean {
  return source === "llm";
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

// ─── /api/workspace/* pure handlers ─────────────────────────────────────
//
// The endpoint surface lives behind the same `^localhost-only` posture as
// /api/file and /api/export — bound to 127.0.0.1, Origin-checked on
// mutating methods, name-validated through `isValidProjectName` BEFORE any
// path joins. We deliberately extract the HANDLER logic into pure
// functions that take a `cwd` parameter and return a structured response;
// the middleware below just wires HTTP plumbing in. Tests exercise the
// pure handlers directly without booting Vite.
//
// Response shape: `{ status: number, body: unknown }`. The middleware
// turns `body` into a JSON response with `Content-Type: application/json`
// when the value is non-string, and a plain text response otherwise (used
// for error strings that match the existing /api endpoints' shape).

/** Result of any /api/workspace/* handler. */
export interface WorkspaceApiResult {
  status: number;
  /** JSON-serializable body, or null for "no body". */
  body: unknown;
}

/** Project entry returned by GET /api/workspace. */
export interface WorkspaceProjectEntry {
  name: string;
  dir: string;
  /** Always true for entries derived from `listProjects` (project.atelier
   *  is the discovery signal). Surfaced for symmetry with the other flags. */
  hasAtelierDoc: boolean;
  /** True iff the project contains any other `*.atelier` files beyond the
   *  manifest (helpful for the UI to show "has content"). */
  hasOtherAtelierDocs: boolean;
  hasDesign: boolean;
  hasScript: boolean;
  hasStoryboard: boolean;
}

/** Build the GET /api/workspace response. */
export function buildWorkspaceInfo(cwd: string): WorkspaceApiResult {
  const ws = findWorkspace(cwd);
  if (!ws) {
    return {
      status: 404,
      body: { error: "no workspace found at or above cwd" },
    };
  }
  const projects = listProjects(ws.workspaceDir).map((name): WorkspaceProjectEntry => {
    const dir = join(ws.workspaceDir, name);
    return {
      name,
      dir,
      hasAtelierDoc: existsSync(join(dir, "project.atelier")),
      hasOtherAtelierDocs: hasNonManifestAtelierDoc(dir),
      hasDesign: existsSync(join(dir, "DESIGN.md")),
      hasScript: existsSync(join(dir, "SCRIPT.md")),
      hasStoryboard: existsSync(join(dir, "STORYBOARD.md")),
    };
  });
  return {
    status: 200,
    body: {
      name: ws.manifest.name,
      default_mode: ws.manifest.default_mode,
      workspaceDir: ws.workspaceDir,
      projects,
    },
  };
}

/** True iff `dir` contains any *.atelier file other than `project.atelier`.
 *  One-level scan — matches the project-as-flat-folder convention. */
function hasNonManifestAtelierDoc(dir: string): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e === "project.atelier") continue;
    if (e.endsWith(".atelier")) return true;
  }
  return false;
}

/**
 * Build the GET /api/workspace/active response. Marks the entry `stale`
 * when the file points at a project that no longer exists on disk — the
 * UI shows the pointer differently in that case (typically "the active
 * project was deleted; pick another"). Returns 200 with `body: null` when
 * no active project is set.
 */
export function buildActiveProject(cwd: string): WorkspaceApiResult {
  const ws = findWorkspace(cwd);
  if (!ws) {
    return { status: 404, body: { error: "no workspace found at or above cwd" } };
  }
  const active = readActiveProject(ws.workspaceDir);
  if (!active) {
    return { status: 200, body: null };
  }
  const stale = !existsSync(join(ws.workspaceDir, active.name, "project.atelier"));
  return {
    status: 200,
    body: stale ? { ...active, stale: true } : active,
  };
}

/** Build the POST /api/workspace/active response. `name` is the body's `name`
 *  field; any other body fields are ignored. */
export function handleSetActiveProject(
  cwd: string,
  body: unknown,
): WorkspaceApiResult {
  const ws = findWorkspace(cwd);
  if (!ws) {
    return { status: 404, body: { error: "no workspace found at or above cwd" } };
  }
  const name = (body as { name?: unknown })?.name;
  if (!isValidProjectName(name)) {
    return {
      status: 400,
      body: { error: `invalid project name (must be single-segment basename, no leading dot, no separators)` },
    };
  }
  try {
    const file = setActiveProject(ws.workspaceDir, name);
    return { status: 200, body: file satisfies ActiveProjectFile };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 400, body: { error: msg } };
  }
}

/** Build the DELETE /api/workspace/active response. */
export function handleClearActiveProject(cwd: string): WorkspaceApiResult {
  const ws = findWorkspace(cwd);
  if (!ws) {
    return { status: 404, body: { error: "no workspace found at or above cwd" } };
  }
  const removed = clearActiveProject(ws.workspaceDir);
  return { status: 200, body: { ok: true, removed } };
}

/**
 * Build the POST /api/workspace/projects response. Accepts:
 *
 *   { name, mode?, activate? }
 *
 * Creates the project via the extracted `createProjectInWorkspace`
 * (no subprocess — runs in-process), and when `activate: true` also
 * writes the active.yaml pointer at the new project. The response
 * surfaces the created project's manifest entry shape (same fields as
 * GET /api/workspace's `projects[]` element) so the UI can splice it
 * into its list without a refetch.
 */
export async function handleCreateProject(
  cwd: string,
  body: unknown,
): Promise<WorkspaceApiResult> {
  const ws = findWorkspace(cwd);
  if (!ws) {
    return { status: 404, body: { error: "no workspace found at or above cwd" } };
  }
  const b = (body ?? {}) as { name?: unknown; mode?: unknown; activate?: unknown };
  if (!isValidProjectName(b.name)) {
    return {
      status: 400,
      body: { error: `invalid project name (must be single-segment basename, no leading dot, no separators)` },
    };
  }
  let mode: LearningMode | undefined;
  if (b.mode !== undefined) {
    if (b.mode !== "ambient" && b.mode !== "explicit") {
      return {
        status: 400,
        body: { error: `invalid mode "${String(b.mode)}" — expected one of ${LEARNING_MODES.join(", ")}` },
      };
    }
    mode = b.mode;
  }
  try {
    await createProjectInWorkspace(ws.workspaceDir, {
      name: b.name,
      ...(mode !== undefined ? { mode } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 400, body: { error: msg } };
  }
  // Optionally flip active.yaml. Failure here is reported but does NOT
  // roll back the create — the project exists on disk and a stale active
  // is a recoverable UI state.
  let active: ActiveProjectFile | null = null;
  let activateError: string | null = null;
  if (b.activate === true) {
    try {
      active = setActiveProject(ws.workspaceDir, b.name);
    } catch (err) {
      activateError = err instanceof Error ? err.message : String(err);
    }
  }
  const dir = join(ws.workspaceDir, b.name);
  const entry: WorkspaceProjectEntry = {
    name: b.name,
    dir,
    hasAtelierDoc: existsSync(join(dir, "project.atelier")),
    hasOtherAtelierDocs: hasNonManifestAtelierDoc(dir),
    hasDesign: existsSync(join(dir, "DESIGN.md")),
    hasScript: existsSync(join(dir, "SCRIPT.md")),
    hasStoryboard: existsSync(join(dir, "STORYBOARD.md")),
  };
  return {
    status: 201,
    body: {
      project: entry,
      active,
      ...(activateError ? { activateError } : {}),
    },
  };
}

// ─── /api/project/:name/{media,transcripts,artifacts} handlers ─────
//
// These run only in workspace mode (when serveDir IS the workspace root).
// In project mode the workspace tree UI is hidden and these endpoints
// return 404 — keeps the surface area minimal for the single-doc path.

/**
 * Resolve a project subdir name to its absolute directory inside the served
 * workspace, validating the name through `isValidProjectName` so a crafted
 * `..`-name can't escape. Returns null on invalid name or missing project.
 *
 * Post-flat-docs-pivot (v1.0.x): a project is identified by `hasProjectMarker`
 * (either a legacy `project.atelier` OR an `.atelier/` metadata subdir). New
 * projects created via `createProjectInWorkspace` are "lazy" — they have the
 * `.atelier/` subdir but no auto-scaffolded `project.atelier`. Earlier this
 * function required `project.atelier`, which produced "project not found"
 * errors when creating docs in freshly-created projects.
 */
export function resolveProjectInWorkspace(
  workspaceDir: string,
  name: unknown,
): string | null {
  if (!isValidProjectName(name)) return null;
  const dir = join(resolve(workspaceDir), name);
  if (!hasProjectMarker(dir)) return null;
  return dir;
}

/** GET /api/project/:name/media → workspace-relative media entry list. */
export function buildProjectMedia(
  workspaceDir: string,
  name: unknown,
): WorkspaceApiResult {
  const dir = resolveProjectInWorkspace(workspaceDir, name);
  if (!dir) return { status: 404, body: { error: `project not found: ${String(name)}` } };
  return { status: 200, body: listProjectMedia(dir, String(name)) };
}

/** GET /api/project/:name/transcripts → transcript file list with metadata. */
export function buildProjectTranscripts(
  workspaceDir: string,
  name: unknown,
): WorkspaceApiResult {
  const dir = resolveProjectInWorkspace(workspaceDir, name);
  if (!dir) return { status: 404, body: { error: `project not found: ${String(name)}` } };
  return { status: 200, body: listProjectTranscripts(dir, String(name)) };
}

/** GET /api/project/:name/artifacts → DESIGN/SCRIPT/STORYBOARD info. */
export function buildProjectArtifacts(
  workspaceDir: string,
  name: unknown,
): WorkspaceApiResult {
  const dir = resolveProjectInWorkspace(workspaceDir, name);
  if (!dir) return { status: 404, body: { error: `project not found: ${String(name)}` } };
  return { status: 200, body: listProjectArtifacts(dir, String(name)) };
}

/**
 * Match `/api/project/:name/(media|transcripts|artifacts)` and return
 * `{ name, kind }`. Used by the middleware to dispatch without ad-hoc regex
 * branching inline. Returns null on no match.
 */
export function matchProjectInfoRoute(
  pathname: string,
): { name: string; kind: "media" | "transcripts" | "artifacts" } | null {
  const m = pathname.match(/^\/api\/project\/([^/]+)\/(media|transcripts|artifacts)$/);
  if (!m) return null;
  return {
    name: decodeURIComponent(m[1]),
    kind: m[2] as "media" | "transcripts" | "artifacts",
  };
}

// ─── DELETE handlers (pure) ────────────────────────────────────────────
//
// Three deletion endpoints sitting on the same safety floor as the GET /
// POST handlers: loopback-bound, Origin-checked (the MUTATING set above
// already includes DELETE), name + path validated BEFORE any disk work.
// All cascade logic lives in #workspace-delete so unit tests exercise it
// without HTTP. The handlers here are a thin translator: outcome → status.

/**
 * Build the DELETE /api/file response. `relPath` is a workspace-relative
 * path; the underlying `deleteWorkspaceFile` enforces resolved containment
 * and refuses directories (use DELETE /api/project for those). Project
 * ownership is derived for the WS envelope so the sidebar can `refreshProject`
 * without re-deriving the owner.
 */
export function handleDeleteFile(
  cwd: string,
  relPath: string | null,
): WorkspaceApiResult & { projectName?: string | null } {
  if (!relPath || relPath.length === 0) {
    return { status: 400, body: { error: "missing path" } };
  }
  const outcome = deleteWorkspaceFile(cwd, relPath);
  if (outcome.kind === "invalid-path") {
    return { status: 400, body: { error: "invalid path" } };
  }
  if (outcome.kind === "is-directory") {
    return {
      status: 400,
      body: { error: "refusing to delete a directory via /api/file — use /api/project/:name" },
    };
  }
  if (outcome.kind === "not-found") {
    return { status: 404, body: { error: "file not found" } };
  }
  // Derive owning project for the WS envelope. projectNameFromPath returns
  // null when the path is at the workspace root (rare — e.g. workspace-level
  // README).
  const projectName = projectNameFromPath(cwd, relPath);
  return {
    status: 200,
    body: { deleted: true, path: outcome.path },
    projectName,
  };
}

/**
 * Build the DELETE /api/project/:name/media response. Cascade-deletes the
 * media file and every artifact derived from it; see
 * #delete-cascade-project-atelier-surgery for the exact rules. Returns 404
 * on missing media (the project itself missing also surfaces as 404 via
 * `invalid-project`, mirroring the GET endpoints' shape).
 */
export function handleDeleteProjectMedia(
  cwd: string,
  name: unknown,
  fileQuery: string | null,
): WorkspaceApiResult {
  if (typeof name !== "string") {
    return { status: 400, body: { error: "missing project name" } };
  }
  if (!fileQuery || fileQuery.length === 0) {
    return { status: 400, body: { error: "missing file" } };
  }
  const outcome = cascadeDeleteMedia(cwd, name, fileQuery);
  switch (outcome.kind) {
    case "invalid-project":
      return { status: 404, body: { error: `project not found: ${String(name)}` } };
    case "invalid-basename":
      return { status: 400, body: { error: "invalid media basename" } };
    case "not-found":
      return { status: 404, body: { error: "media file not found" } };
    case "deleted":
      return { status: 200, body: { deleted: outcome.report } };
  }
}

/**
 * Build the DELETE /api/project/:name response. Removes the whole project
 * subdir, clears active.yaml if it pointed at the project, and trims the
 * workspace manifest's projects[] list when present.
 */
export function handleDeleteProject(
  cwd: string,
  name: unknown,
): WorkspaceApiResult {
  if (typeof name !== "string") {
    return { status: 400, body: { error: "missing project name" } };
  }
  const outcome = deleteProject(cwd, name);
  switch (outcome.kind) {
    case "invalid-name":
      return { status: 400, body: { error: "invalid project name" } };
    case "not-found":
      return { status: 404, body: { error: `project not found: ${String(name)}` } };
    case "deleted":
      return {
        status: 200,
        body: {
          deleted: true,
          name: outcome.report.name,
          wasActive: outcome.report.wasActive,
          manifestUpdated: outcome.report.manifestUpdated,
        },
      };
  }
}

/**
 * Match `/api/project/:name/media` for the DELETE method specifically — same
 * URL as the GET handler, but the middleware dispatches on method. (We reuse
 * `matchProjectInfoRoute` for the GET path; this matcher is a thin pair so
 * the DELETE branch reads symmetrically without an inline regex.)
 */
export function matchProjectMediaDeleteRoute(
  pathname: string,
): { name: string } | null {
  const m = pathname.match(/^\/api\/project\/([^/]+)\/media$/);
  if (!m) return null;
  return { name: decodeURIComponent(m[1]) };
}

/** Match `/api/project/:name` (no trailing segment) — DELETE target. */
export function matchProjectRoute(pathname: string): { name: string } | null {
  const m = pathname.match(/^\/api\/project\/([^/]+)$/);
  if (!m) return null;
  return { name: decodeURIComponent(m[1]) };
}

/**
 * Handle POST /api/media/rename. Atomic media-file rename cascade: media file +
 * transcript + every reference inside project.atelier are rewritten in one
 * two-phase op (see #rename-media for the spec).
 *
 * Path-traversal defense — Aegis audit surface:
 *   - `oldBasename` / `newBasename` MUST pass `isValidMediaBasenameForRename`,
 *     which rejects `/`, `\`, `..`, leading-`.`, NUL / control bytes and the
 *     empty / whitespace-only string. The underlying `renameMedia` does NOT
 *     re-validate — it joins straight into `media/<basename>` — so this is the
 *     single line of defense for the HTTP layer.
 *   - The project name is funneled through `resolveProjectInWorkspace`, which
 *     itself validates through `isValidProjectName` BEFORE any disk work,
 *     keeping any crafted `..`-name from escaping the workspace root.
 * Both checks happen BEFORE the rename call so a probe can't even trigger an
 * `existsSync` outside the project dir.
 *
 * Pure: no HTTP, no WS — the middleware translates the WorkspaceApiResult and
 * (on 200) broadcasts a `media:list:changed` envelope. Mirrors the
 * `handleDeleteProjectMedia` shape so unit tests can exercise the surface
 * without spinning up Vite.
 */
export async function handleMediaRenameRequest(
  cwd: string,
  projectName: unknown,
  body: unknown,
): Promise<WorkspaceApiResult & { result?: RenameMediaResult }> {
  // Project name — validated by resolveProjectInWorkspace via isValidProjectName.
  const projectDir = resolveProjectInWorkspace(cwd, projectName);
  if (!projectDir) {
    return { status: 404, body: { error: `project not found: ${String(projectName)}` } };
  }

  // Body shape: { oldBasename: string, newBasename: string }.
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "missing JSON body" } };
  }
  const { oldBasename, newBasename } = body as { oldBasename?: unknown; newBasename?: unknown };

  // ── Path-traversal defense ──────
  // `renameMedia` joins `<projectDir>/media/<basename>` directly. Without
  // this gate, a crafted `../../etc/passwd` would let an attacker probe
  // (via existsSync) — or rename — files outside `media/`. Reject any
  // separator / leading-dot / control char up front. Aegis: audit here.
  if (!isValidMediaBasenameForRename(oldBasename)) {
    return { status: 400, body: { error: "invalid basename" } };
  }
  if (!isValidMediaBasenameForRename(newBasename)) {
    return { status: 400, body: { error: "invalid basename" } };
  }

  try {
    const result = await renameMedia({ projectDir, oldBasename, newBasename });
    return { status: 200, body: { success: true, result }, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Map the cascade's "not found" / "already exists" outcomes to 4xx; every
    // other failure (rollback or disk IO) becomes a 500.
    if (msg.includes("media file not found") || msg.includes("missing project.atelier")) {
      return { status: 404, body: { error: msg } };
    }
    if (msg.includes("destination file already exists") || msg.includes("no media/ dir")) {
      return { status: 400, body: { error: msg } };
    }
    return { status: 500, body: { error: msg } };
  }
}

// ── doc-management HTTP handlers (v1.0.x) ──────────────────────────
//
// Four endpoints (GET list / POST create / POST duplicate / DELETE) sit on
// the same safety floor as the rest of /api/project/* — loopback-bound,
// Origin-checked on mutating methods (MUTATING set in the middleware below),
// project name funneled through `resolveProjectInWorkspace` which itself
// gates on `isValidProjectName` BEFORE any disk work.
//
// In addition, every endpoint that takes a user-supplied `?path` or
// `body.name` runs through the centralised `validateProjectRelativeDocPath`
// helper below — Aegis audit surface, mirrors the posture established by
// `handleMediaRenameRequest` above.

/**
 * Path-traversal defense — Aegis audit surface (single source of truth for
 * the doc-management HTTP layer).
 *
 * Validates a user-supplied `?path=` query (project-relative .atelier doc
 * path). Defense-in-depth rules, applied in order:
 *
 *   1. Must be a non-empty string after `.trim()`.
 *   2. URL-decoded ONCE via `decodeURIComponent` (the query string the
 *      browser sends is already URL-decoded by Vite's URL parser; we
 *      decode again to be paranoid against tools that double-encode).
 *   3. Reject absolute paths (leading `/`).
 *   4. Reject any `..` substring (parent-dir traversal).
 *   5. Reject backslash (Windows path separator — every project path on disk
 *      uses POSIX slashes regardless of OS).
 *   6. Reject any segment that starts with `.` (hidden / dotfile leaders).
 *   7. Reject control bytes (NUL through 0x1f) — `decodeURIComponent("%00")`
 *      survives the earlier substring checks but is the canonical "smuggle
 *      a null byte past native fs" trick. Mirrors Aegis Finding 4
 *      (TD-2026-05-27) in rename-media.ts.
 *   8. Resolved absolute path MUST live inside `<projectDir>/`. Defence-in-
 *      depth — the substring checks above already make `..` impossible, but
 *      a containment assert is the right invariant to ship for any future
 *      change to the regex set.
 *
 * Returns the validated decoded path on success, or `{ error: string }` on
 * any reject. The handlers below translate that into a 400-with-error body.
 */
function validateProjectRelativeDocPath(
  rawQuery: unknown,
  projectDir: string,
): { ok: true; decoded: string } | { ok: false; error: string } {
  if (typeof rawQuery !== "string") return { ok: false, error: "missing path" };
  const trimmed = rawQuery.trim();
  if (trimmed.length === 0) return { ok: false, error: "missing path" };

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return { ok: false, error: "invalid path encoding" };
  }
  if (decoded.length === 0) return { ok: false, error: "missing path" };
  if (decoded.startsWith("/")) return { ok: false, error: "invalid path" };
  if (decoded.includes("..")) return { ok: false, error: "invalid path" };
  if (decoded.includes("\\")) return { ok: false, error: "invalid path" };
  // Reject control bytes (NUL through 0x1f). Aegis Finding 4 — keep the
  // escape sequence rather than literal bytes so a future format pass can't
  // silently mangle the class.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(decoded)) return { ok: false, error: "invalid path" };
  // Reject any segment starting with a dot (catches `.hidden`, `./foo`, etc).
  for (const seg of decoded.split("/")) {
    if (seg.length === 0) return { ok: false, error: "invalid path" };
    if (seg.startsWith(".")) return { ok: false, error: "invalid path" };
  }

  // Containment assert — defense-in-depth.
  const resolved = resolve(projectDir, decoded);
  const root = resolve(projectDir);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    return { ok: false, error: "invalid path" };
  }

  return { ok: true, decoded };
}

/**
 * GET /api/project/:name/docs → DocListEntry[].
 *
 * Pure / read-only. No path input; project name flows through
 * `resolveProjectInWorkspace` which is itself gated by `isValidProjectName`.
 */
export function buildProjectDocs(
  workspaceDir: string,
  projectName: string,
): WorkspaceApiResult {
  const dir = resolveProjectInWorkspace(workspaceDir, projectName);
  if (!dir) {
    return { status: 404, body: { error: `project not found: ${projectName}` } };
  }
  try {
    const docs = listDocs(dir);
    return { status: 200, body: docs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 500, body: { error: msg } };
  }
}

/**
 * POST /api/project/:name/docs → create a fresh doc OR a carousel slide.
 *
 * Path-traversal defense — Aegis audit surface:
 *   - `projectName` → resolveProjectInWorkspace (validates via
 *     isValidProjectName BEFORE any disk join).
 *   - `body.name` → isValidDocName (rejects `/`, `\`, `..`, leading `.`,
 *     control bytes, empty/whitespace, >200 chars). The downstream slugger
 *     in `createDoc` then maps the human name to a fs-safe stem.
 *   - `body.carouselDocPath` (when asCarouselSlide:true) → validated via
 *     `validateProjectRelativeDocPath` so a crafted `../../etc/passwd` can't
 *     trick `composeCarouselProject` into pointing slides[].src outside the
 *     workspace.
 */
export async function handleCreateDoc(
  workspaceDir: string,
  projectName: string,
  body: unknown,
): Promise<WorkspaceApiResult> {
  const dir = resolveProjectInWorkspace(workspaceDir, projectName);
  if (!dir) {
    return { status: 404, body: { error: `project not found: ${projectName}` } };
  }
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "missing JSON body" } };
  }
  const b = body as {
    name?: unknown;
    kind?: unknown;
    asCarouselSlide?: unknown;
    carouselDocPath?: unknown;
    insertAt?: unknown;
  };

  // ── Path-traversal defense (Aegis) ──────
  if (!isValidDocName(b.name)) {
    return { status: 400, body: { error: "invalid doc name" } };
  }
  if (b.kind !== "video" && b.kind !== "image" && b.kind !== "carousel") {
    return { status: 400, body: { error: "invalid doc kind" } };
  }
  const kind = b.kind as DocKind;
  const asCarouselSlide = b.asCarouselSlide === true;
  let carouselDocPath: string | undefined;
  if (asCarouselSlide) {
    // Post-pivot (Unit A): every doc is equal — no implicit "project.atelier"
    // default. The caller (the "+ add slide" button in Wave 3) always knows
    // the active carousel doc and must pass it explicitly.
    if (b.carouselDocPath === undefined || b.carouselDocPath === null) {
      return {
        status: 400,
        body: { error: "carouselDocPath is required when asCarouselSlide=true" },
      };
    }
    const v = validateProjectRelativeDocPath(b.carouselDocPath, dir);
    if (!v.ok) return { status: 400, body: { error: v.error } };
    carouselDocPath = v.decoded;
  }
  let insertAt: number | undefined;
  if (b.insertAt !== undefined) {
    if (typeof b.insertAt !== "number" || !Number.isInteger(b.insertAt) || b.insertAt < 0) {
      return { status: 400, body: { error: "invalid insertAt" } };
    }
    insertAt = b.insertAt;
  }

  try {
    const opts: Parameters<typeof createDoc>[0] = {
      projectDir: dir,
      name: b.name,
      kind,
    };
    if (asCarouselSlide) opts.asCarouselSlide = true;
    if (carouselDocPath !== undefined) opts.carouselDocPath = carouselDocPath;
    if (insertAt !== undefined) opts.insertAt = insertAt;
    const result = await createDoc(opts);
    const body: { docPath: string; appendedSlideIndex?: number } = {
      docPath: result.docPath,
    };
    if (result.appendedSlideIndex !== undefined) {
      body.appendedSlideIndex = result.appendedSlideIndex;
    }
    return { status: 201, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("invalid doc name") || msg.includes("collision suffix")) {
      return { status: 400, body: { error: msg } };
    }
    return { status: 500, body: { error: msg } };
  }
}

/**
 * POST /api/project/:name/docs/duplicate?path=...
 *
 * Path-traversal defense — Aegis audit surface:
 *   - `projectName` → resolveProjectInWorkspace (isValidProjectName gate).
 *   - `?path` query → `validateProjectRelativeDocPath` (full decode +
 *     reject + containment assert).
 *
 * Post-pivot (Unit A): every doc is equal — there is no manifest-refusal
 * branch. `project.atelier` duplicates just like any other doc.
 */
export async function handleDuplicateDoc(
  workspaceDir: string,
  projectName: string,
  docPathQuery: string | null,
  body: unknown,
): Promise<WorkspaceApiResult> {
  const dir = resolveProjectInWorkspace(workspaceDir, projectName);
  if (!dir) {
    return { status: 404, body: { error: `project not found: ${projectName}` } };
  }
  const v = validateProjectRelativeDocPath(docPathQuery, dir);
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const b = (body && typeof body === "object" ? body : {}) as { appendSlideRef?: unknown };
  const appendSlideRef = b.appendSlideRef === true;

  try {
    const opts: Parameters<typeof duplicateDoc>[0] = {
      projectDir: dir,
      sourceDocPath: v.decoded,
    };
    if (appendSlideRef) opts.appendSlideRef = true;
    const report = await duplicateDoc(opts);
    return { status: 200, body: report };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("source doc not found")) {
      return { status: 404, body: { error: msg } };
    }
    if (
      msg.includes("appendSlideRef requires a slide source") ||
      msg.includes("collision suffix")
    ) {
      return { status: 400, body: { error: msg } };
    }
    return { status: 500, body: { error: msg } };
  }
}

/**
 * DELETE /api/project/:name/docs?path=...
 *
 * Path-traversal defense — Aegis audit surface:
 *   - `projectName` → resolveProjectInWorkspace (isValidProjectName gate).
 *   - `?path` query → `validateProjectRelativeDocPath` (full decode +
 *     reject + containment assert).
 *
 * Post-pivot (Unit A): every doc is equal — there is no manifest-refusal
 * branch. Deleting `project.atelier` is allowed; whole-project delete
 * (cascade of the entire project directory) still lives behind DELETE
 * /api/project/:name and is a separate concern.
 */
export async function handleDeleteDoc(
  workspaceDir: string,
  projectName: string,
  docPathQuery: string | null,
): Promise<WorkspaceApiResult> {
  const dir = resolveProjectInWorkspace(workspaceDir, projectName);
  if (!dir) {
    return { status: 404, body: { error: `project not found: ${projectName}` } };
  }
  const v = validateProjectRelativeDocPath(docPathQuery, dir);
  if (!v.ok) return { status: 400, body: { error: v.error } };

  try {
    const report = deleteDoc({
      workspaceDir,
      projectName,
      docPath: v.decoded,
    });
    return { status: 200, body: report };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("doc not found")) {
      return { status: 404, body: { error: msg } };
    }
    return { status: 500, body: { error: msg } };
  }
}

/** Match `/api/project/:name/docs` exactly (used for GET/POST/DELETE). */
export function matchProjectDocsRoute(
  pathname: string,
): { name: string } | null {
  const m = pathname.match(/^\/api\/project\/([^/]+)\/docs$/);
  if (!m) return null;
  return { name: decodeURIComponent(m[1]) };
}

/** Match `/api/project/:name/docs/duplicate` exactly (POST only). */
export function matchProjectDocsDuplicateRoute(
  pathname: string,
): { name: string } | null {
  const m = pathname.match(/^\/api\/project\/([^/]+)\/docs\/duplicate$/);
  if (!m) return null;
  return { name: decodeURIComponent(m[1]) };
}

/**
 * Read an incoming request body as a UTF-8 string, then JSON-parse it.
 * Returns `undefined` on empty body, throws on invalid JSON. Used by the
 * middleware to feed the pure handlers above.
 */
function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (raw.length === 0) return resolveBody(undefined);
      try {
        resolveBody(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Write a `WorkspaceApiResult` to an HTTP response. Object bodies emit
 * JSON; null bodies emit `null` JSON (the documented "no active project"
 * shape); string bodies emit text (used nowhere yet, kept for symmetry
 * with the surrounding /api handlers).
 */
function writeJsonResult(
  res: import("node:http").ServerResponse,
  result: WorkspaceApiResult,
): void {
  res.statusCode = result.status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result.body));
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

/**
 * Generate the tiny `main.ts` entry shim that Vite serves from the temp dir.
 *
 * The ~700-LOC studio client used to live here as a template-literal STRING
 * (no typecheck, no lint, no tests — which is exactly why the autosave
 * save-race and slider-flood bugs hid in it). It now lives as a real,
 * typechecked module at `src/web/inline-app.ts` (see #studio-inline-app),
 * exported as `bootStudioApp(config)`.
 *
 * This shim imports that module by ABSOLUTE path under the CLI package and
 * calls it with the injected `{ initialFile }`. The CLI ships `src/web/**` as
 * raw source (package `files` glob), so the path resolves identically in dev
 * (`packages/cli`) and prod (`dist/cli.js` → package root) — both via
 * `resolveCliPackageDir()`. Vite's dev server transpiles + serves the TS
 * module at request time (`server.fs.strict: false` lets it read source
 * outside the temp root).
 *
 * Resolution choice: a direct absolute-path import is the lowest-risk option —
 * no virtual-module plugin, no extra build step. Do NOT reintroduce a string.
 */
function getInlineApp(initialFile: string | null, cliPackageDir: string): string {
  const initialFileStr = initialFile ? JSON.stringify(initialFile) : "null";
  // Absolute, POSIX-style path so the generated import specifier is valid on
  // all platforms (Vite/ESM specifiers use forward slashes even on Windows).
  const appModulePath = join(cliPackageDir, "src", "web", "inline-app.ts").split(sep).join("/");
  return `import { bootStudioApp } from ${JSON.stringify(appModulePath)};
bootStudioApp({ initialFile: ${initialFileStr} });
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

/**
 * Pure cwd-context classifier for `atelier studio`. Inspects the filesystem
 * around `cwd` and returns one of three shapes:
 *
 *   - `workspace`: `cwd` is inside a workspace (a dir containing
 *     `workspace.atelier`), and `cwd` itself is NOT a Project subdir. The
 *     result carries `workspaceDir` and a `projects[]` list (scanned via
 *     `listProjects`, so it reflects on-disk truth, not the manifest's
 *     advisory list).
 *   - `project`: either `cwd` is a Project subdir of a workspace, OR no
 *     workspace was found and `cwd` itself looks like a Project (has a
 *     `project.atelier` OR contains `.atelier` files — preserving the
 *     legacy single-project studio behavior). The result carries
 *     `projectDir`, and `workspaceDir` when applicable.
 *   - `empty`: neither a workspace nor a project context exists at or
 *     above `cwd`. The CLI surface prompts the user to create a workspace.
 *
 * Note: a project dir found INSIDE a workspace but NOT listed in the
 * workspace's `projects[]` manifest field still classifies as `project`
 * — on-disk truth wins; the manifest's list is advisory. (See deliverable
 * #4 design resolution.)
 */
export function studioContext(cwd: string): {
  kind: "workspace" | "project" | "empty";
  workspaceDir?: string;
  projectDir?: string;
  projects?: string[];
} {
  const absCwd = resolve(cwd);
  const ws = findWorkspace(absCwd);

  if (ws) {
    // Inside a workspace. If cwd IS the workspace root, workspace mode.
    if (absCwd === ws.workspaceDir) {
      return {
        kind: "workspace",
        workspaceDir: ws.workspaceDir,
        projects: listProjects(ws.workspaceDir),
      };
    }
    // If cwd is a project subdir (direct child with project.atelier), project mode.
    if (isProjectDir(absCwd)) {
      return {
        kind: "project",
        workspaceDir: ws.workspaceDir,
        projectDir: absCwd,
      };
    }
    // Inside the workspace but not at root and not a project — still
    // workspace mode (the user is somewhere intermediate; treat as the
    // workspace itself).
    return {
      kind: "workspace",
      workspaceDir: ws.workspaceDir,
      projects: listProjects(ws.workspaceDir),
    };
  }

  // No workspace. Fall back to legacy project detection: project.atelier
  // OR any *.atelier file present in cwd → project mode.
  if (isProjectDir(absCwd) || findAtelierFiles(absCwd).length > 0) {
    return {
      kind: "project",
      projectDir: absCwd,
    };
  }

  return { kind: "empty" };
}

/** Promisified one-shot readline question (matches init.ts pattern). */
async function question(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise<string>((resolveP) => {
      rl.question(prompt, (answer) => resolveP(answer));
    });
  } finally {
    rl.close();
  }
}

/** Parse a mode string (CLI --mode or interactive). Throws on bad input. */
function parseModeFlag(raw: string | undefined): LearningMode | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.toLowerCase();
  if (normalized !== "ambient" && normalized !== "explicit") {
    throw new Error(
      `invalid --mode "${raw}" — expected one of ${LEARNING_MODES.join(", ")}`,
    );
  }
  return normalized;
}

/**
 * Interactive workspace-mode prompt. Lets the creator pick Ambient or
 * Explicit at workspace-creation time (same two-option shape `atelier init`
 * uses), capped at 3 attempts to mirror the existing pattern.
 */
async function promptForWorkspaceMode(): Promise<LearningMode> {
  process.stdout.write(
    `How should your agent team learn? (workspace default — inherited by every project here)\n` +
    `\n` +
    `  1) Ambient — the team captures corrections silently and surfaces patterns when confident.\n` +
    `  2) Explicit — nothing locks in without your "yes"; high-control, more friction.\n` +
    `\n`,
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = (await question(`Choose [1/2]: `)).trim().toLowerCase();
    if (answer === "1" || answer === "ambient") return "ambient";
    if (answer === "2" || answer === "explicit") return "explicit";
    process.stdout.write(`Please enter 1, 2, ambient, or explicit.\n`);
  }
  throw new Error(
    `couldn't determine learning mode after 3 attempts ` +
    `(hint: re-run with --mode ambient or --mode explicit)`,
  );
}

/**
 * Yes/no prompt with a default. Returns true on yes; case-insensitive.
 * Empty input maps to the default.
 */
async function promptYesNo(promptText: string, defaultYes: boolean): Promise<boolean> {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const raw = (await question(`${promptText} ${suffix}: `)).trim().toLowerCase();
  if (raw === "") return defaultYes;
  return raw === "y" || raw === "yes";
}

/** Register the `studio` subcommand on the Commander program. */
export function studioCommand(program: Command): void {
  program
    .command("studio [target]")
    .description(
      "Launch the browser-based Atelier editor. Context-aware: opens a project " +
      "directly when run inside one, or lets you pick from a workspace's projects. " +
      "Pass --new to create a workspace.",
    )
    .option("-p, --port <number>", "Port to serve on", "4321")
    .option("--no-open", "Don't auto-open browser")
    .option(
      "--new [name]",
      "Create a new workspace. With a name, creates `<cwd>/<name>/`; without, " +
      "creates a workspace at cwd (named after the cwd basename).",
    )
    .option(
      "--mode <ambient|explicit>",
      "Set the workspace's default learning mode (used with --new; skips the prompt).",
    )
    .option(
      "--force",
      "Allow `--new` to overwrite an existing workspace.atelier (no-op otherwise).",
    )
    .option(
      "--no-paradigm-integration",
      "Skip the Paradigm + Atelier symbiosis pass even when the target dir is " +
      "Paradigm-initialized. Default: integrate when present.",
    )
    .action(
      async (
        target: string | undefined,
        options: {
          port: string;
          open: boolean;
          new?: string | boolean;
          mode?: string;
          force?: boolean;
          paradigmIntegration?: boolean;
        },
      ) => {
        const port = parseInt(options.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          console.error(`Invalid port: ${options.port}`);
          process.exit(1);
        }

        const startCwd = process.cwd();

        // ─── --new: create a workspace ──────────────────────────────────
        // Accepts an optional NAME (sub-dir) or absent (use cwd itself).
        let workspaceCreated = false;
        let workspaceLaunchDir: string | undefined;
        if (options.new !== undefined && options.new !== false) {
          const nameArg = typeof options.new === "string" ? options.new : undefined;
          const targetDir = nameArg ? resolve(startCwd, nameArg) : startCwd;
          let mode: LearningMode;
          try {
            const parsed = parseModeFlag(options.mode);
            mode = parsed ?? (await promptForWorkspaceMode());
          } catch (err) {
            console.error(`atelier studio: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
            return;
          }
          const wsOpts: CreateWorkspaceOptions = {
            mode,
            name: nameArg ? basename(targetDir) : basename(targetDir),
            force: options.force === true,
            skipParadigmIntegration: options.paradigmIntegration === false,
          };
          try {
            const { manifest, paradigmAugmentation } = createWorkspace(targetDir, wsOpts);
            workspaceCreated = true;
            workspaceLaunchDir = targetDir;
            console.log("");
            console.log(`  Atelier Workspace: ${manifest.name}`);
            console.log(`  Created at: ${targetDir}`);
            console.log(`  Default learning mode: ${manifest.default_mode}`);
            // Paradigm + Atelier symbiosis report. Banner content matches
            // the spec — informative-but-not-overwhelming summary of which
            // augmentations actually ran. When Paradigm is absent, point
            // the creator at `paradigm shift` for the augmented path.
            if (paradigmAugmentation) {
              console.log(`  Paradigm: detected — augmented`);
              console.log(
                `    • CLAUDE.md: section ${paradigmAugmentation.claudeMd.action} (sentinel-bracketed)`,
              );
              const agentList = [
                ...paradigmAugmentation.agents.added,
                ...paradigmAugmentation.agents.updated,
              ]
                .map((f) => f.replace(/\.md$/, ""))
                .join(", ");
              const agentCount =
                paradigmAugmentation.agents.added.length +
                paradigmAugmentation.agents.updated.length;
              console.log(
                `    • .claude/agents/: ${agentCount} file(s) (${agentList})`,
              );
              console.log(`    • .mcp.json: atelier server ${paradigmAugmentation.mcpJson.action}`);
              const personaSummary =
                paradigmAugmentation.personas.added.length > 0
                  ? `${paradigmAugmentation.personas.added.length} entries added (${paradigmAugmentation.personas.added.join(", ")})`
                  : `entries ${paradigmAugmentation.personas.action}`;
              console.log(`    • .paradigm/personas/: ${personaSummary}`);
            } else if (options.paradigmIntegration === false) {
              console.log(`  Paradigm: integration skipped (--no-paradigm-integration)`);
            } else {
              console.log(
                `  Paradigm: not detected (run \`paradigm shift\` first for lore tracking + augmentation)`,
              );
            }
            console.log(`  Next: run \`atelier init <project>\` from inside the workspace.`);
            console.log("");
          } catch (err) {
            console.error(`atelier studio --new: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
            return;
          }
        }

        // ─── Detect context (after potential --new creation) ────────────
        const contextCwd = workspaceLaunchDir ?? startCwd;
        const ctx = studioContext(contextCwd);

        // Resolve the directory the studio dev-server should serve.
        let serveDir: string;
        let projectLabel: string | undefined;
        let workspaceName: string | undefined;

        if (ctx.kind === "workspace") {
          const projects = ctx.projects ?? [];
          const wsDir = ctx.workspaceDir!;
          try {
            const manifest = findWorkspace(wsDir)?.manifest;
            workspaceName = manifest?.name ?? basename(wsDir);
          } catch {
            workspaceName = basename(wsDir);
          }

          // Positional `target` lets the caller pre-select a project by name —
          // it's surfaced via active.yaml so the workspace UI opens to it on
          // first paint. Validate against the on-disk projects list.
          let pick: string | undefined;
          if (target) {
            if (projects.includes(target)) {
              pick = target;
            } else {
              console.error(
                `atelier studio: project "${target}" not found in workspace ` +
                `"${workspaceName}". Known: ${projects.length > 0 ? projects.join(", ") : "(none)"}`,
              );
              process.exit(1);
              return;
            }
          } else if (projects.length === 0) {
            // Just-created workspace — still open the workspace UI so the
            // creator can use the "+ New" button to create a project from
            // the sidebar (no need to drop back to the shell).
            console.log(`  Workspace "${workspaceName}" has no projects yet — launching empty UI.`);
          }

          // Workspace mode: the dev server is rooted at the WORKSPACE itself
          // so the new workspace-tree UI can see every project + media file
          // and the new `/api/project/:name/*` endpoints can target any of
          // them by name. Active selection flows through active.yaml — the
          // browser reads it on boot via `/api/workspace/active`.
          serveDir = wsDir;
          if (pick) {
            // Best-effort: set active.yaml so the browser opens to the right
            // project. Stale pointer is harmless (the UI marks it `stale:true`).
            try { setActiveProject(wsDir, pick); } catch { /* non-fatal */ }
            projectLabel = pick;
          } else if (projects.length === 1) {
            try { setActiveProject(wsDir, projects[0]); } catch { /* non-fatal */ }
            projectLabel = projects[0];
          }
        } else if (ctx.kind === "project") {
          serveDir = ctx.projectDir!;
          projectLabel = basename(serveDir);
          if (ctx.workspaceDir) {
            try {
              workspaceName =
                findWorkspace(ctx.workspaceDir)?.manifest.name ?? basename(ctx.workspaceDir);
            } catch {
              workspaceName = basename(ctx.workspaceDir);
            }
          }
        } else {
          // empty
          if (workspaceCreated) {
            // Workspace was just created (--new with no project yet). Already
            // handled above by the projects.length===0 path? No — the --new
            // path falls through to ctx detection. Re-detect:
            console.log(`  Created workspace; nothing to open yet.`);
            return;
          }
          // Prompt the creator to make a workspace.
          console.log("");
          console.log(`  No workspace or project found at ${startCwd}.`);
          const wantWorkspace = await promptYesNo("Create a workspace here?", true);
          if (!wantWorkspace) {
            console.log(`  Tip: run \`atelier studio --new <name>\` to create one.`);
            return;
          }
          // Re-dispatch as if --new had been supplied. Inherit --mode if set.
          let mode: LearningMode;
          try {
            mode = parseModeFlag(options.mode) ?? (await promptForWorkspaceMode());
          } catch (err) {
            console.error(`atelier studio: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
            return;
          }
          try {
            const { manifest } = createWorkspace(startCwd, {
              mode,
              name: basename(resolve(startCwd)),
              force: options.force === true,
              skipParadigmIntegration: options.paradigmIntegration === false,
            });
            console.log(`  Created workspace "${manifest.name}" at ${startCwd}.`);
            console.log(`  Run \`atelier init <project>\` to create your first project.`);
          } catch (err) {
            console.error(`atelier studio: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
            return;
          }
          return;
        }

        // The historical studio launch logic, refactored to serve `serveDir`.
        await launchStudioServer({
          cwd: serveDir,
          port,
          autoOpen: options.open,
          initialFile: ctx.kind === "project" && target && existsSync(resolve(serveDir, target))
            ? target
            : undefined,
          projectLabel,
          workspaceName,
        });
      },
    );
}

/**
 * Vite + WS bridge launcher — the historical studio body, parameterized.
 *
 * Splitting this out lets the context-aware dispatcher (`studioCommand`)
 * decide WHICH directory to serve before any server is spawned. The body
 * itself is unchanged in behavior: 127.0.0.1 bind, /api file ops with
 * Origin checks on mutating endpoints, /bridge + /mcp WS upgrades with
 * re-checked Origin, llm-only mutation broadcasts. See aspects
 * #studio-localhost-only-bind, #studio-origin-check-bridge-vs-mcp-split,
 * #studio-ws-upgrade-rechecks-origin, #studio-llm-only-broadcast.
 */
interface LaunchStudioOptions {
  /** Directory the dev server treats as cwd. */
  cwd: string;
  port: number;
  autoOpen: boolean;
  /** Optional initial file path (relative to `cwd`). */
  initialFile?: string;
  /** Display label for the served project (banner only). */
  projectLabel?: string;
  /** Display label for the containing workspace, if any. */
  workspaceName?: string;
}

/**
 * Handle a `POST /api/media/ingest` request. Streams the body into a temp
 * file, copies into the named project's `media/` directory, then runs
 * `composeVideoProject` to compose a playable doc. Progress envelopes are
 * broadcast over the bridge so the browser can show a status overlay.
 *
 * The contract is intentionally simple: octet-stream body + headers, no
 * multipart parser dep. Matches the existing /api/export upload shape.
 */
export function handleMediaIngestRequest(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  cwd: string,
  bridgeClients: Set<WsWebSocket>,
): void {
  const projectName = headerString(req, "x-atelier-project");
  const filename = headerString(req, "x-atelier-filename");
  const modelHeader = headerString(req, "x-atelier-model") ?? "base.en";

  // Optional `?targetDocPath=<relative>` — set by the canvas-area drop zone
  // when the user has a doc loaded and expects the upload to attach to it
  // (not scaffold a new <slug>.atelier). Parsed BEFORE we touch the disk so a
  // malformed traversal fails fast with a 400. URL constructor decodes once.
  let targetDocPathRaw: string | null = null;
  // ── v1.0 media-bin pivot (Kit-A) ──
  // `?source=existing&path=media/<basename>` lets the sidebar→canvas drop
  // skip the upload — the file is already in media/. Both query params are
  // parsed up front so we can short-circuit the body-reading entirely.
  let sourceParam: string | null = null;
  let existingPathParam: string | null = null;
  try {
    const parsed = new URL(req.url ?? "/", "http://localhost");
    targetDocPathRaw = parsed.searchParams.get("targetDocPath");
    sourceParam = parsed.searchParams.get("source");
    existingPathParam = parsed.searchParams.get("path");
  } catch {
    targetDocPathRaw = null;
    sourceParam = null;
    existingPathParam = null;
  }

  if (!isValidProjectName(projectName)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "missing or invalid x-atelier-project header" }));
    return;
  }

  // ── v1.0 media-bin pivot (Kit-A) ──────────────────────────────────
  // `?source=existing` short-circuit: the file is already in media/. No body
  // to stream — we route straight to composeVideoProject / audio-add using
  // the on-disk source. Sidebar→canvas drag handoff lives here.
  if (sourceParam === "existing") {
    handleExistingSourceIngest({
      req, res, cwd, projectName, projectDir: join(resolve(cwd), projectName),
      existingPathParam, targetDocPathRaw, modelHeader, bridgeClients,
    });
    return;
  }
  // ──────────────────────────────────────────────────────────────────

  if (!filename || filename.includes("/") || filename.includes("\\") || filename.startsWith(".")) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "missing or invalid x-atelier-filename header" }));
    return;
  }

  const projectDir = join(resolve(cwd), projectName);
  // NOTE: a missing project.atelier is no longer fatal — the dispatcher
  // (see #ingest-dispatch) will route a fresh upload to `compose-video` or
  // `compose-image` and scaffold the project. We only require the parent
  // (workspace) dir to exist so we don't accidentally create projects in
  // a non-workspace cwd.
  if (!existsSync(resolve(cwd))) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `workspace not found: ${cwd}` }));
    return;
  }
  if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

  const mediaDir = join(projectDir, "media");
  if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true });
  const destPath = join(mediaDir, filename);

  // Stream the body straight to disk. No buffering — keeps memory bounded
  // for large video uploads.
  broadcastIngest(bridgeClients, {
    type: "media:ingest:progress",
    projectName,
    file: filename,
    phase: "start",
  });

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  req.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    totalBytes += chunk.length;
  });
  req.on("error", (err) => {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `upload failed: ${err.message}` }));
  });
  req.on("end", () => {
    try {
      writeFileSync(destPath, Buffer.concat(chunks));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      broadcastIngest(bridgeClients, {
        type: "media:ingest:progress",
        projectName,
        file: filename,
        phase: "error",
        error: msg,
      });
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: msg }));
      return;
    }

    // ── v1.0 media-bin pivot (Kit-A) ────────────────────────────────
    //
    // Two routing paths post-TD-2026-05-28:
    //   1. NO-TARGET (`?targetDocPath` absent): file just lands in media/.
    //      No doc creation. Composition is explicit later via sidebar drag.
    //      Background transcription kicks off for video/audio.
    //   2. TARGET-SET (`?targetDocPath=<doc>`): legacy canvas-drop behaviour
    //      — attach to the loaded doc via compose-video / add-audio-clip.

    if (targetDocPathRaw === null) {
      handleNoTargetBinAdd({
        res, projectName, projectDir, filename, destPath,
        totalBytes, modelHeader, bridgeClients,
      });
      return;
    }

    // ── Resolve explicit `?targetDocPath=` (canvas-area drop) ───────
    //
    // When the client picked a specific doc, three checks gate dispatch:
    //   1. Path-traversal validation — same rules as elsewhere in the API.
    //   2. The file exists on disk (404 otherwise — a stale doc path).
    //   3. The doc parses and exposes a `kind` — the dispatcher needs it
    //      to encode the explicit-target compatibility matrix.
    let resolvedTargetDocPath: string | undefined;
    let resolvedTargetDocKind: ProjectKind | undefined;
    let audioTargetDocPath: string | undefined;
    {
      const v = validateProjectRelativeDocPath(
        encodeURIComponent(targetDocPathRaw),
        projectDir,
      );
      if (!v.ok) {
        try { rmSync(destPath, { force: true }); } catch { /* non-fatal */ }
        broadcastIngest(bridgeClients, {
          type: "media:ingest:progress",
          projectName,
          file: filename,
          phase: "error",
          error: v.error,
        });
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: v.error }));
        return;
      }
      const targetAbs = join(projectDir, v.decoded);
      if (!existsSync(targetAbs)) {
        try { rmSync(destPath, { force: true }); } catch { /* non-fatal */ }
        const errorMsg = `target doc not found: ${v.decoded}`;
        broadcastIngest(bridgeClients, {
          type: "media:ingest:progress",
          projectName,
          file: filename,
          phase: "error",
          error: errorMsg,
        });
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: errorMsg }));
        return;
      }
      try {
        const targetDoc = readAtelierDoc(targetAbs);
        resolvedTargetDocKind = targetDoc.kind;
      } catch (err) {
        try { rmSync(destPath, { force: true }); } catch { /* non-fatal */ }
        const errorMsg = `target doc unparseable: ${err instanceof Error ? err.message : String(err)}`;
        broadcastIngest(bridgeClients, {
          type: "media:ingest:progress",
          projectName,
          file: filename,
          phase: "error",
          error: errorMsg,
        });
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: errorMsg }));
        return;
      }
      resolvedTargetDocPath = v.decoded;
      audioTargetDocPath = v.decoded;
    }

    const route = routeIngestWithTarget(
      filename,
      resolvedTargetDocPath,
      resolvedTargetDocKind,
    );

    // ── Reject path ─────────────────────────────────────────────────
    if (route.target === "reject") {
      // Cleanup the just-uploaded file so the project isn't left with an
      // orphan in media/. Critical: otherwise repeated rejected uploads
      // accumulate.
      try { rmSync(destPath, { force: true }); } catch { /* non-fatal */ }
      broadcastIngest(bridgeClients, {
        type: "media:ingest:progress",
        projectName,
        file: filename,
        phase: "error",
        error: route.error ?? "ingest rejected",
      });
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: route.error ?? "ingest rejected" }));
      return;
    }

    // File is staying — let listeners know media/ changed.
    broadcastIngest(bridgeClients, {
      type: "media:list:changed",
      projectName,
    });

    // ── Video path (compose-video, transcribe-included) ─────────────
    if (route.target === "compose-video") {
      // Kick off transcription + composition asynchronously. The HTTP response
      // returns immediately with `accepted` once the file is on disk — the
      // browser tracks ingest progress via WS envelopes from here.
      broadcastIngest(bridgeClients, {
        type: "media:ingest:progress",
        projectName,
        file: filename,
        phase: "transcribing",
      });

      // Clear any leftover source.<ext> from prior ingest paths — modern
      // ingest passes the media file path directly via TranscribeOptions.sourcePath
      // and never writes source.<ext> at root. The cleanup keeps the project
      // surface free of legacy clutter as projects migrate.
      {
        const POSSIBLE = [".mp4", ".mov", ".webm", ".mkv", ".avi"];
        for (const e of POSSIBLE) {
          const stale = join(projectDir, `source${e}`);
          if (existsSync(stale)) {
            try { rmSync(stale); } catch { /* non-fatal */ }
          }
        }
      }

      // ── v1.0 media-bin pivot (Kit-A) ──
      // Target-set compose-video always carries `route.docPath` (set by
      // `routeIngestWithTarget`). The no-target / bin-add path does not
      // reach this branch.
      const ingestVideoDocPath = route.docPath ?? resolvedTargetDocPath ?? "project.atelier";
      composeVideoProject({
        projectDir,
        docPath: ingestVideoDocPath,
        sourceFile: destPath,
        mediaBasename: filename,
        // Pass the media file's real path to whisper directly — no more copying
        // to source.<ext> at root (TD-2026-05-27 clean-project stance).
        transcribeOptions: { model: modelHeader as never, sourcePath: destPath },
      })
        .then((result) => {
          broadcastIngest(bridgeClients, {
            type: "media:ingest:progress",
            projectName,
            file: filename,
            phase: "composing",
          });
          // Per-file transcript mirror lives at `transcripts/<stem>.json` —
          // see #transcribe-orchestrator. Strip the extension before broadcasting
          // so the studio sidebar can locate the right file. Fall back to the
          // legacy root transcript path when the orchestrator didn't run a mirror
          // (shouldn't happen on this code path; defensive only).
          const stem = filename.replace(/\.[^./\\]+$/, "");
          const transcriptPath = result.mirroredTranscriptPath
            ? `${projectName}/transcripts/${stem}.json`
            : `${projectName}/transcript.json`;
          broadcastIngest(bridgeClients, {
            type: "transcript:added",
            projectName,
            transcriptPath,
          });
          broadcastIngest(bridgeClients, {
            type: "media:ingest:progress",
            projectName,
            file: filename,
            phase: "done",
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            ok: true,
            projectName,
            file: filename,
            bytes: totalBytes,
            kind: "video",
            addedVideoLayer: result.addedVideoLayer,
            targetStateName: result.targetStateName,
            targetDurationSeconds: result.targetDurationSeconds,
            wordCount: result.transcribe?.wordCount ?? null,
          }));
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          broadcastIngest(bridgeClients, {
            type: "media:ingest:progress",
            projectName,
            file: filename,
            phase: "error",
            error: msg,
          });
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: msg }));
        });
      return;
    }

    // ── v1.0 media-bin pivot (Kit-A) ──
    // (compose-image branch removed — target-set routing never returns
    // compose-image; image+target always rejects. The bin-add path handles
    // image drops without doc creation.)

    // ── Audio path (add-audio-clip, in-process) ─────────────────────
    if (route.target === "add-audio-clip") {
      broadcastIngest(bridgeClients, {
        type: "media:ingest:progress",
        projectName,
        file: filename,
        phase: "composing",
      });
      // ── v1.0 media-bin pivot (Kit-A) ──
      // Audio-add only runs when the caller supplied a target doc that
      // resolves to kind:"video" — the routing matrix rejects everything
      // else. `audioTargetDocPath` was populated alongside the target
      // resolution above.
      const audioDocAbs = join(projectDir, audioTargetDocPath ?? "project.atelier");
      (async () => {
        const doc = readAtelierDoc(audioDocAbs);
        let clipDurationSeconds = 0;
        try {
          clipDurationSeconds = await probeDuration(destPath);
        } catch {
          clipDurationSeconds = 0;
        }
        const fps = doc.canvas.fps;
        const clipDurationFrames = Math.max(1, Math.round(clipDurationSeconds * fps));
        const slug = slugifyBasename(filename);
        if (!slug) {
          throw new Error(`cannot derive a slug from "${filename}"`);
        }
        const clipLayerId = `aud-${slug}`;
        let working: AtelierDocument = doc;
        const ensured = ensureClipLayer(working, {
          clipLayerId,
          trackId: AUDIO_TRACK_ID,
          sourceName: `media/${filename}`,
          clipDurationSeconds,
          clipDurationFrames,
          kind: "audio",
        });
        working = recomputeTimeline(ensured.doc);
        writeFileSync(audioDocAbs, JSON.stringify(working, null, 2), "utf-8");
        return { addedLayer: ensured.addedLayer, clipLayerId };
      })()
        .then((result) => {
          broadcastIngest(bridgeClients, {
            type: "media:ingest:progress",
            projectName,
            file: filename,
            phase: "done",
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            ok: true,
            projectName,
            file: filename,
            bytes: totalBytes,
            kind: "audio",
            addedAudioLayer: result.addedLayer,
            layerId: result.clipLayerId,
          }));
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          broadcastIngest(bridgeClients, {
            type: "media:ingest:progress",
            projectName,
            file: filename,
            phase: "error",
            error: msg,
          });
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: msg }));
        });
      return;
    }

    // Unreachable: the dispatcher returns one of the four targets above.
    // Defensive 500 in case a new target is added without handling.
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: `internal: unhandled dispatch target "${String(route.target)}"` }));
  });
}

// ── v1.0 media-bin pivot (Kit-A) ──────────────────────────────────────
/**
 * Handle a no-target ingest: file lands in `media/`, transcription kicks off
 * for video/audio in the background, no doc creation.
 *
 * Post-pivot (TD-2026-05-28): the dispatcher's no-target branch collapses to
 * a kind classify + bin add. Composition is explicit downstream — `+ new
 * doc` then sidebar-drag-to-canvas (which hits `?source=existing`).
 *
 * Response shape: `{ ok, mediaPath, fileKind, transcribePending }`.
 */
function handleNoTargetBinAdd(args: {
  res: import("node:http").ServerResponse;
  projectName: string;
  projectDir: string;
  filename: string;
  destPath: string;
  totalBytes: number;
  modelHeader: string;
  bridgeClients: Set<WsWebSocket>;
}): void {
  const { res, projectName, projectDir, filename, destPath, totalBytes, modelHeader, bridgeClients } = args;
  const route = routeIngest(filename);
  if (route.target === "reject") {
    try { rmSync(destPath, { force: true }); } catch { /* non-fatal */ }
    broadcastIngest(bridgeClients, {
      type: "media:ingest:progress",
      projectName,
      file: filename,
      phase: "error",
      error: route.error ?? "ingest rejected",
    });
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: route.error ?? "ingest rejected" }));
    return;
  }

  // File is in media/ — broadcast and (for video/audio) kick off background
  // transcription. Image drops finish immediately.
  broadcastIngest(bridgeClients, {
    type: "media:list:changed",
    projectName,
  });

  const fileKind = route.kind as "video" | "image" | "audio";
  const needsTranscribe = fileKind === "video" || fileKind === "audio";
  const transcribePending = needsTranscribe;

  if (needsTranscribe) {
    broadcastIngest(bridgeClients, {
      type: "media:ingest:progress",
      projectName,
      file: filename,
      phase: "transcribing",
    });
    // Fire-and-forget background transcribe. The HTTP response returns
    // synchronously below; bridge envelopes carry progress. Idempotent via
    // transcribeMediaToBin's existing-mirror short-circuit.
    transcribeMediaToBin(projectDir, filename, {
      model: modelHeader as never,
      sourcePath: destPath,
    })
      .then(() => {
        const stem = filename.replace(/\.[^./\\]+$/, "");
        broadcastIngest(bridgeClients, {
          type: "transcript:added",
          projectName,
          transcriptPath: `${projectName}/transcripts/${stem}.json`,
        });
        // ToastHost on the browser side discriminates bin-add completion
        // by mediaPath + !targetDocPath. Both fields must travel on the
        // envelope; without them the toast silently no-ops (Judge audit).
        broadcastIngest(bridgeClients, {
          type: "media:ingest:progress",
          projectName,
          file: filename,
          phase: "done",
          mediaPath: `media/${filename}`,
          fileKind,
          transcribePending,
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        broadcastIngest(bridgeClients, {
          type: "media:ingest:progress",
          projectName,
          file: filename,
          phase: "error",
          error: msg,
        });
      });
  } else {
    broadcastIngest(bridgeClients, {
      type: "media:ingest:progress",
      projectName,
      file: filename,
      phase: "done",
      mediaPath: `media/${filename}`,
      fileKind,
      transcribePending,
    });
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    ok: true,
    projectName,
    file: filename,
    bytes: totalBytes,
    mediaPath: `media/${filename}`,
    fileKind,
    transcribePending,
  }));
}

/**
 * Handle a `?source=existing` ingest — the sidebar→canvas drag handoff.
 *
 * The file is already in `<projectDir>/<path>` (typically `media/<basename>`).
 * We skip the upload step entirely, validate the path + the target doc, then
 * dispatch through `routeIngestWithTarget` so the existing compose paths
 * (compose-video, add-audio-clip) handle the actual composition.
 *
 * Validation:
 *   - `path` query must satisfy `isValidMediaRefPath` (under media/, no
 *     traversal, no nulls).
 *   - The source file must exist on disk (404 otherwise).
 *   - The target doc path goes through the standard
 *     `validateProjectRelativeDocPath` + existence + parse checks.
 *
 * Notably: NO file cleanup on rejection — the source file already existed in
 * media/ before this request; we never created it.
 */
function handleExistingSourceIngest(args: {
  req: import("node:http").IncomingMessage;
  res: import("node:http").ServerResponse;
  cwd: string;
  projectName: string;
  projectDir: string;
  existingPathParam: string | null;
  targetDocPathRaw: string | null;
  modelHeader: string;
  bridgeClients: Set<WsWebSocket>;
}): void {
  const {
    res, cwd, projectName, projectDir, existingPathParam,
    targetDocPathRaw, bridgeClients,
  } = args;
  // Drain the request body — clients may send one even though we don't need it.
  // Without this, HTTP/1.1 keep-alive holds the socket until the client closes
  // (Aegis informational finding). Guarded for test mocks that pass a stub
  // without the .resume method.
  if (typeof args.req.resume === "function") args.req.resume();

  if (!existsSync(resolve(cwd))) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: `workspace not found: ${cwd}` }));
    return;
  }
  if (!existsSync(projectDir)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: `project not found: ${projectName}` }));
    return;
  }

  // Path validation — must be a real media-ref ("media/<basename>", no
  // traversal). The same predicate the sidebar drag payload uses.
  if (!isValidMediaRefPath(existingPathParam)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "invalid path: must be a media/ ref" }));
    return;
  }
  const sourceRel = existingPathParam; // string narrowed by predicate
  const sourceAbs = join(projectDir, sourceRel);
  if (!existsSync(sourceAbs)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: `media file not found: ${sourceRel}` }));
    return;
  }

  // Derive a stable basename for routing + broadcast. We trust the file on
  // disk; `isValidMediaRefPath` already rejected slashes after the prefix.
  const filename = sourceRel.slice("media/".length);

  // Target doc path is required for the existing-source path — without it
  // the operation reduces to "do nothing", which is never what the caller
  // wanted. Surface the bad request explicitly.
  if (targetDocPathRaw === null) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "targetDocPath required for source=existing" }));
    return;
  }
  const v = validateProjectRelativeDocPath(
    encodeURIComponent(targetDocPathRaw),
    projectDir,
  );
  if (!v.ok) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: v.error }));
    return;
  }
  const targetAbs = join(projectDir, v.decoded);
  if (!existsSync(targetAbs)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: `target doc not found: ${v.decoded}` }));
    return;
  }
  let resolvedTargetDocKind: ProjectKind | undefined;
  try {
    const targetDoc = readAtelierDoc(targetAbs);
    resolvedTargetDocKind = targetDoc.kind;
  } catch (err) {
    const errorMsg = `target doc unparseable: ${err instanceof Error ? err.message : String(err)}`;
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: errorMsg }));
    return;
  }
  const resolvedTargetDocPath = v.decoded;

  broadcastIngest(bridgeClients, {
    type: "media:ingest:progress",
    projectName,
    file: filename,
    phase: "start",
  });

  const route = routeIngestWithTarget(
    filename,
    resolvedTargetDocPath,
    resolvedTargetDocKind,
  );

  if (route.target === "reject") {
    broadcastIngest(bridgeClients, {
      type: "media:ingest:progress",
      projectName,
      file: filename,
      phase: "error",
      error: route.error ?? "ingest rejected",
    });
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: route.error ?? "ingest rejected" }));
    return;
  }

  if (route.target === "compose-video") {
    broadcastIngest(bridgeClients, {
      type: "media:ingest:progress",
      projectName,
      file: filename,
      phase: "composing",
    });
    const docPath = route.docPath ?? resolvedTargetDocPath;
    composeVideoProject({
      projectDir,
      docPath,
      sourceFile: sourceAbs,
      mediaBasename: filename,
      transcribeOptions: { model: args.modelHeader as never, sourcePath: sourceAbs },
    })
      .then((result) => {
        broadcastIngest(bridgeClients, {
          type: "media:ingest:progress",
          projectName,
          file: filename,
          phase: "done",
        });
        // Push the post-compose doc out as an llm:mutation envelope so the
        // browser's layers panel + timeline refresh in lockstep with the
        // ingest-progress `done`. Without this the user has to click away and
        // back to see the new clip (latent flat-docs-pivot bug — Arky's spot).
        broadcastIngest(bridgeClients, {
          type: "llm:mutation",
          documentId: `${projectName}/${resolvedTargetDocPath}`,
          doc: result.doc,
          source: "system",
          toolName: "media:ingest:existing",
        });
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          ok: true,
          projectName,
          file: filename,
          mediaPath: sourceRel,
          kind: "video",
          addedVideoLayer: result.addedVideoLayer,
          targetStateName: result.targetStateName,
          targetDurationSeconds: result.targetDurationSeconds,
        }));
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        broadcastIngest(bridgeClients, {
          type: "media:ingest:progress",
          projectName,
          file: filename,
          phase: "error",
          error: msg,
        });
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: msg }));
      });
    return;
  }

  if (route.target === "add-audio-clip") {
    broadcastIngest(bridgeClients, {
      type: "media:ingest:progress",
      projectName,
      file: filename,
      phase: "composing",
    });
    const audioDocAbs = join(projectDir, resolvedTargetDocPath);
    (async () => {
      const doc = readAtelierDoc(audioDocAbs);
      let clipDurationSeconds = 0;
      try {
        clipDurationSeconds = await probeDuration(sourceAbs);
      } catch {
        clipDurationSeconds = 0;
      }
      const fps = doc.canvas.fps;
      const clipDurationFrames = Math.max(1, Math.round(clipDurationSeconds * fps));
      const slug = slugifyBasename(filename);
      if (!slug) throw new Error(`cannot derive a slug from "${filename}"`);
      const clipLayerId = `aud-${slug}`;
      let working: AtelierDocument = doc;
      const ensured = ensureClipLayer(working, {
        clipLayerId,
        trackId: AUDIO_TRACK_ID,
        sourceName: `media/${filename}`,
        clipDurationSeconds,
        clipDurationFrames,
        kind: "audio",
      });
      working = recomputeTimeline(ensured.doc);
      writeFileSync(audioDocAbs, JSON.stringify(working, null, 2), "utf-8");
      return { addedLayer: ensured.addedLayer, clipLayerId, doc: working };
    })()
      .then((result) => {
        broadcastIngest(bridgeClients, {
          type: "media:ingest:progress",
          projectName,
          file: filename,
          phase: "done",
        });
        // Symmetric with the compose-video branch — emit the post-add doc so
        // the layers panel + timeline refresh without a panel-switch reload.
        broadcastIngest(bridgeClients, {
          type: "llm:mutation",
          documentId: `${projectName}/${resolvedTargetDocPath}`,
          doc: result.doc,
          source: "system",
          toolName: "media:ingest:existing",
        });
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          ok: true,
          projectName,
          file: filename,
          mediaPath: sourceRel,
          kind: "audio",
          addedAudioLayer: result.addedLayer,
          layerId: result.clipLayerId,
        }));
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        broadcastIngest(bridgeClients, {
          type: "media:ingest:progress",
          projectName,
          file: filename,
          phase: "error",
          error: msg,
        });
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: msg }));
      });
    return;
  }

  // Defensive: routeIngestWithTarget never returns compose-image under
  // current v1 rules (image+target always rejects).
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: false, error: `internal: unhandled dispatch target "${String(route.target)}"` }));
}
// ──────────────────────────────────────────────────────────────────────

/** Pull a single string header from an IncomingMessage, lowercased lookup. */
function headerString(
  req: import("node:http").IncomingMessage,
  name: string,
): string | null {
  const v = req.headers[name.toLowerCase()];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0) return v[0];
  return null;
}

/** Helper that re-uses the bridge broadcaster but with the new envelopes. */
function broadcastIngest(
  clients: Set<WsWebSocket>,
  envelope: BridgeEnvelope,
): void {
  broadcastToBridge(clients, envelope);
}

async function launchStudioServer(opts: LaunchStudioOptions): Promise<void> {
  const { cwd, port, autoOpen, initialFile, projectLabel, workspaceName } = opts;
  // The rest of this function is the historical action body, lightly
  // edited so `cwd` is the parameter instead of `process.cwd()`.
  {

        // Find the CLI package directory (where node_modules + templates live).
        const cliPackageDir = resolveCliPackageDir();
        const version = readCliVersion(cliPackageDir);

        // First-run scaffold: if CWD has zero .atelier files, drop in welcome.atelier
        // so the user lands on something real instead of an empty-state dead-end.
        const scaffolded = scaffoldWelcomeIfEmpty(cwd, cliPackageDir);

        console.log("");
        console.log(`  Atelier Studio · v${version}`);
        if (workspaceName && projectLabel) {
          console.log(`  Workspace: ${workspaceName} · Project: ${projectLabel}`);
        } else if (projectLabel) {
          console.log(`  Project: ${projectLabel}`);
        }
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
        writeFileSync(join(tmpDir, "main.ts"), getInlineApp(initialFile ?? null, cliPackageDir));

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
          // Create parent dirs first so a doc:patch over the WS bridge for a
          // subfolder doc (e.g. `notes/x.atelier`) doesn't ENOENT and lose the
          // edit — mirrors what the POST /api/file handler already does.
          writeFileEnsuringDir(resolve(cwd, docId), serializeAtelier(doc));
        };

        // Persist LLM/system mutations to disk so the on-disk .atelier file
        // stays in lock-step with what the browser shows. Without this, a
        // refresh would lose the LLM's edits.
        bridgeState.store.onChange((id, doc, source) => {
          // Only LLM/agent edits get persisted + broadcast. "human" is already
          // persisted by /api/file POST and the browser is current; "system" is
          // GET-hydration of a file the user just opened (the bytes are already
          // on disk and in the browser) — broadcasting it would fire a phantom
          // "agent edited document" toast on a plain file-open.
          if (!shouldBroadcastMutation(source)) return;
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
                        const mimeAndKind = getFileServeKind(absPath);
                        if (mimeAndKind.kind === "binary") {
                          // Binary media (mp4, mov, webm, mp3, png, ...) — stream
                          // with the correct MIME type and Range support so
                          // <video>/<audio> elements can seek.
                          serveBinaryFile(req, res, absPath, mimeAndKind.mime);
                          return;
                        }
                        const content = readFileSync(absPath, "utf-8");
                        // For .atelier docs, mirror into the shared store so MCP
                        // clients connecting over /mcp see the same active doc
                        // and the bridge broadcasts to late-joining browsers.
                        if (absPath.endsWith(".atelier")) {
                          const parsed = parseAtelier(content);
                          if (parsed.success) {
                            bridgeState.store.set(filePath, parsed.data, "system");
                            bridgeState.currentDocId = filePath;
                          }
                        }
                        res.setHeader("Content-Type", mimeAndKind.mime);
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
                          // Creates parent dirs first so a new file in a
                          // subfolder (e.g. `notes/foo.atelier`) doesn't ENOENT.
                          writeFileEnsuringDir(absPath, body);
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

                    if (req.method === "DELETE") {
                      // Single-file delete. The pure handler walks the same
                      // isSafePath / refuse-directory guards as the POST
                      // sibling but ends in unlinkSync; we broadcast
                      // `file:deleted` so the sidebar invalidates the right
                      // section without a full workspace refetch.
                      const result = handleDeleteFile(cwd, filePath);
                      writeJsonResult(res, result);
                      if (result.status === 200) {
                        broadcastIngest(bridgeClients, {
                          type: "file:deleted",
                          path: filePath,
                          projectName: result.projectName ?? null,
                        });
                      }
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

                  // ── /api/workspace/* — Phase 1 backend wiring ────────
                  // All endpoints flow through the same loopback bind and
                  // Origin check that gate /api/file above (the MUTATING
                  // check earlier in this middleware covers POST/DELETE).
                  // Handlers themselves are pure functions in this module
                  // so unit tests exercise them without booting Vite.
                  if (url.pathname === "/api/workspace" && (req.method === "GET" || !req.method)) {
                    writeJsonResult(res, buildWorkspaceInfo(cwd));
                    return;
                  }

                  if (url.pathname === "/api/workspace/active") {
                    if (req.method === "GET" || !req.method) {
                      writeJsonResult(res, buildActiveProject(cwd));
                      return;
                    }
                    if (req.method === "POST") {
                      readJsonBody(req).then(
                        (body) => writeJsonResult(res, handleSetActiveProject(cwd, body)),
                        (err) => {
                          res.statusCode = 400;
                          res.setHeader("Content-Type", "application/json");
                          res.end(JSON.stringify({ error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }));
                        },
                      );
                      return;
                    }
                    if (req.method === "DELETE") {
                      writeJsonResult(res, handleClearActiveProject(cwd));
                      return;
                    }
                    res.statusCode = 405;
                    res.end("Method not allowed");
                    return;
                  }

                  if (url.pathname === "/api/workspace/projects" && req.method === "POST") {
                    readJsonBody(req).then(
                      async (body) => writeJsonResult(res, await handleCreateProject(cwd, body)),
                      (err) => {
                        res.statusCode = 400;
                        res.setHeader("Content-Type", "application/json");
                        res.end(JSON.stringify({ error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }));
                      },
                    ).catch((err) => {
                      res.statusCode = 500;
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
                    });
                    return;
                  }

                  // ── /api/project/:name/{media,transcripts,artifacts}
                  // Only meaningful in workspace mode where `cwd` IS the
                  // workspace root. In project mode the resolveProjectInWorkspace
                  // guard returns 404 (no `<cwd>/<name>/project.atelier`), so
                  // the same code path is safe either way.
                  const projectInfo = matchProjectInfoRoute(url.pathname);
                  if (projectInfo && (req.method === "GET" || !req.method)) {
                    if (projectInfo.kind === "media") {
                      writeJsonResult(res, buildProjectMedia(cwd, projectInfo.name));
                      return;
                    }
                    if (projectInfo.kind === "transcripts") {
                      writeJsonResult(res, buildProjectTranscripts(cwd, projectInfo.name));
                      return;
                    }
                    if (projectInfo.kind === "artifacts") {
                      writeJsonResult(res, buildProjectArtifacts(cwd, projectInfo.name));
                      return;
                    }
                  }

                  // ── DELETE /api/project/:name/media?file=<basename>
                  // Cascade-deletes the media file + per-file transcript +
                  // sidecar notes + every layer in project.atelier that
                  // references the source. See #delete-cascade-project-atelier-surgery.
                  const projectMediaDel = matchProjectMediaDeleteRoute(url.pathname);
                  if (projectMediaDel && req.method === "DELETE") {
                    const fileQuery = url.searchParams.get("file");
                    const result = handleDeleteProjectMedia(cwd, projectMediaDel.name, fileQuery);
                    writeJsonResult(res, result);
                    if (result.status === 200 && typeof fileQuery === "string") {
                      broadcastIngest(bridgeClients, {
                        type: "media:deleted",
                        projectName: projectMediaDel.name,
                        file: fileQuery,
                      });
                    }
                    return;
                  }

                  // ── DELETE /api/project/:name
                  // Whole-project delete. rm-rf the dir, clear active.yaml
                  // when it pointed at us, trim workspace manifest's
                  // projects[] when present. See #delete-active-project-clears-active-yaml.
                  const projectDel = matchProjectRoute(url.pathname);
                  if (projectDel && req.method === "DELETE") {
                    const result = handleDeleteProject(cwd, projectDel.name);
                    writeJsonResult(res, result);
                    if (result.status === 200) {
                      const body = result.body as { wasActive: boolean };
                      broadcastIngest(bridgeClients, {
                        type: "project:deleted",
                        projectName: projectDel.name,
                        wasActive: body.wasActive,
                      });
                    }
                    return;
                  }

                  // ── doc-management v1.0.x HTTP ──────
                  // GET    /api/project/:name/docs                  → list
                  // POST   /api/project/:name/docs                  → create
                  // POST   /api/project/:name/docs/duplicate?path=  → duplicate
                  // DELETE /api/project/:name/docs?path=            → delete
                  // Path-traversal defense lives inside each handler
                  // (validateProjectRelativeDocPath / isValidDocName /
                  // isManifestDoc). The MUTATING set above already gates POST
                  // and DELETE under /api/ with the Origin check.
                  const docsDup = matchProjectDocsDuplicateRoute(url.pathname);
                  if (docsDup && req.method === "POST") {
                    const docPathQuery = url.searchParams.get("path");
                    readJsonBody(req)
                      .then(async (rawBody) => {
                        const result = await handleDuplicateDoc(cwd, docsDup.name, docPathQuery, rawBody);
                        writeJsonResult(res, result);
                        if (result.status === 200) {
                          broadcastIngest(bridgeClients, {
                            type: "doc:list:changed",
                            projectName: docsDup.name,
                          });
                        }
                      })
                      .catch((err: unknown) => {
                        const msg = err instanceof Error ? err.message : String(err);
                        res.statusCode = 400;
                        res.setHeader("Content-Type", "application/json");
                        res.end(JSON.stringify({ error: `invalid JSON body: ${msg}` }));
                      });
                    return;
                  }

                  const docsRoute = matchProjectDocsRoute(url.pathname);
                  if (docsRoute && (req.method === "GET" || !req.method)) {
                    writeJsonResult(res, buildProjectDocs(cwd, docsRoute.name));
                    return;
                  }
                  if (docsRoute && req.method === "POST") {
                    readJsonBody(req)
                      .then(async (rawBody) => {
                        const result = await handleCreateDoc(cwd, docsRoute.name, rawBody);
                        writeJsonResult(res, result);
                        if (result.status === 201) {
                          broadcastIngest(bridgeClients, {
                            type: "doc:list:changed",
                            projectName: docsRoute.name,
                          });
                        }
                      })
                      .catch((err: unknown) => {
                        const msg = err instanceof Error ? err.message : String(err);
                        res.statusCode = 400;
                        res.setHeader("Content-Type", "application/json");
                        res.end(JSON.stringify({ error: `invalid JSON body: ${msg}` }));
                      });
                    return;
                  }
                  if (docsRoute && req.method === "DELETE") {
                    const docPathQuery = url.searchParams.get("path");
                    handleDeleteDoc(cwd, docsRoute.name, docPathQuery)
                      .then((result) => {
                        writeJsonResult(res, result);
                        if (result.status === 200) {
                          broadcastIngest(bridgeClients, {
                            type: "doc:list:changed",
                            projectName: docsRoute.name,
                          });
                        }
                      })
                      .catch((err: unknown) => {
                        const msg = err instanceof Error ? err.message : String(err);
                        res.statusCode = 500;
                        res.setHeader("Content-Type", "application/json");
                        res.end(JSON.stringify({ error: msg }));
                      });
                    return;
                  }

                  // ── POST /api/media/ingest — drag-and-drop video → playable.
                  //
                  // Multipart-free contract: the client sends the raw bytes as
                  // application/octet-stream and identifies the target project
                  // + filename via headers. Simpler than a hand-rolled multipart
                  // parser and avoids any new dep.
                  //
                  //   x-atelier-project: <project-name>   (workspace mode only)
                  //   x-atelier-filename: <basename>      (no path separators)
                  //   x-atelier-model: <whisper model>    (optional, default "base.en")
                  if (url.pathname === "/api/media/ingest" && req.method === "POST") {
                    handleMediaIngestRequest(req, res, cwd, bridgeClients);
                    return;
                  }

                  // ── POST /api/media/rename — atomic basename cascade.
                  //
                  // Project identified via x-atelier-project header (same
                  // family as /api/media/ingest). JSON body carries
                  // { oldBasename, newBasename }. Path-traversal defense
                  // lives in handleMediaRenameRequest (Aegis audit surface).
                  if (url.pathname === "/api/media/rename" && req.method === "POST") {
                    const projectName = headerString(req, "x-atelier-project");
                    readJsonBody(req)
                      .then(async (rawBody) => {
                        const result = await handleMediaRenameRequest(cwd, projectName, rawBody);
                        writeJsonResult(res, result);
                        if (result.status === 200 && typeof projectName === "string") {
                          broadcastIngest(bridgeClients, {
                            type: "media:list:changed",
                            projectName,
                          });
                        }
                      })
                      .catch((err: unknown) => {
                        const msg = err instanceof Error ? err.message : String(err);
                        res.statusCode = 400;
                        res.setHeader("Content-Type", "application/json");
                        res.end(JSON.stringify({ error: `invalid JSON body: ${msg}` }));
                      });
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

            // ^localhost-only Origin check for WS upgrades. /bridge is a real
            // browser origin (strict same-origin), but /mcp serves non-browser
            // MCP clients that send NO Origin header — so /mcp tolerates a
            // missing Origin while still rejecting a present-but-foreign one.
            const origin = req.headers.origin;
            const originOk =
              url.pathname === "/mcp"
                ? isAllowedMcpOrigin(origin, port)
                : isAllowedOrigin(origin, port);
            if (!originOk) {
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

        if (initialFile) {
          console.log(`  Opening: ${initialFile}`);
        }

        console.log(`  Press Ctrl+C to stop\n`);

        if (autoOpen) {
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
  }
}
