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

import { resolve, join, relative, dirname, sep } from "node:path";
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
        writeFileSync(join(tmpDir, "main.ts"), getInlineApp(file ?? null, cliPackageDir));

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
