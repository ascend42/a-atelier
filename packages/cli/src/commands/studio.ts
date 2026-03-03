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
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync, realpathSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import type { Command } from "commander";

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
  await fetch("/api/file?path=" + encodeURIComponent(path), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: content,
  });
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
    } catch {
      errors++;
    }
    progress.value = exported + errors;
  }

  // Done
  title.textContent = "Export Complete";
  fileLabel.textContent = "";
  statusText.textContent = exported + " exported" + (errors > 0 ? ", " + errors + " failed" : "");

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

  studio = new AtelierStudio(editorContainer, {
    mode: "full",
    initialTab: "yaml",
    allowSave: true,
    onDocumentChange: (doc) => {
      // Auto-save with debounce
      const indicator = statusBar.querySelector(".save-indicator");
      if (indicator) {
        indicator.className = "save-indicator save-indicator--saving";
        indicator.innerHTML = "&#9679; saving...";
      }

      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        if (!currentFile) return;
        const yaml = serializeAtelier(doc);
        await saveFileContent(currentFile, yaml);
        const ind = statusBar.querySelector(".save-indicator");
        if (ind) {
          ind.className = "save-indicator save-indicator--saved";
          ind.innerHTML = "&#10003; saved";
        }
      }, 800);
    },
  });
  studio.setTheme(theme);
  studio.setFilename(baseName);
  studio.loadDocument(result.data);
}

// ── Boot ──
async function boot(): Promise<void> {
  files = await fetchFiles();

  if (files.length === 0) {
    editorContainer.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "main__empty";
    empty.textContent = "No .atelier files found in this directory";
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
`;
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

        // Find the CLI package directory (where node_modules lives).
        // This file is at packages/cli/dist/cli.js (or src/commands/studio.ts in dev).
        const cliPackageDir = resolve(dirname(new URL(import.meta.url).pathname), "..");

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

        console.log(`Starting Atelier Studio...`);
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

        const server = await vite.createServer({
          root: tmpDir,
          server: {
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
                server.middlewares.use((req, res, next) => {
                  const url = new URL(req.url ?? "/", `http://localhost:${port}`);

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
                          res.end("OK");
                        } catch {
                          res.statusCode = 500;
                          res.end("Write failed");
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
                      } catch {
                        res.statusCode = 500;
                        res.end("Write failed");
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
