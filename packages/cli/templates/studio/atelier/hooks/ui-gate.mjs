#!/usr/bin/env node
// Atelier UI gate — a Claude Code hook installed by `atelier setup`.
//
//   node ui-gate.mjs post   PostToolUse (Edit|Write|MultiEdit|NotebookEdit)
//   node ui-gate.mjs stop   Stop
//
// post: when an agent edits a UI file, remember it for the session and tell
//       the agent (once) how UI work is vetted here: the repo's design record,
//       an independent review by Mika's ui-build-protocol, rendered checks.
// stop: block the turn from ending while UI files changed since the last
//       review, until a review (or a one-line waiver) is written to the
//       session's review file. Blocks only on that one condition.
//
// State and the review file live next to the session transcript
// (~/.claude/projects/<project>/ui-gate/), which sandboxed sessions can write.
// No dependencies, no child processes: it must stay well under a second.
//
// Off switches: ATELIER_UI_GATE=off, or `{"off": true}` in <repo>/.atelier/ui-gate.json.
// That file can also list path prefixes to `include` or `exclude`, relative to the repo.

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, appendFileSync } from "node:fs";
import { dirname, join, relative, basename, extname, isAbsolute, sep } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const STRONG_EXT = new Set([".tsx", ".jsx", ".vue", ".svelte", ".astro", ".css", ".scss", ".sass", ".less", ".html", ".htm"]);
const WEAK_EXT = new Set([".ts", ".js", ".mjs", ".cjs"]);
const UI_SEGMENT = /^(gui|ui|components?|views?|pages|screens|widgets|web|frontend|client|static|public|styles?|theme|layouts?)$|-(gui|ui|web)$/;
const SKIP_SEGMENT = /^(node_modules|dist|build|out|\.next|\.nuxt|coverage|__tests__|__snapshots__|test|tests|fixtures|\.git)$/;
const TEST_FILE = /\.(test|spec|stories)\.[a-z]+$|\.d\.ts$/;
const HEADINGS = ["Files", "Inventory", "Consistency", "Placement", "States", "Copy", "Responsiveness", "Accessibility", "Rendered", "Verdict"];
const MAX_BLOCKS = 3;

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function findUp(start, marker) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, marker))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function repoRoot(file) {
  const dir = dirname(file);
  return findUp(dir, ".atelier") ?? findUp(dir, ".git") ?? dir;
}

function repoConfig(root) {
  try {
    return JSON.parse(readFileSync(join(root, ".atelier", "ui-gate.json"), "utf8"));
  } catch {
    return {};
  }
}

/** Is `file` UI source a person will see? Exported for tests. */
export function isUiFile(file, home = homedir()) {
  if (!file || !isAbsolute(file)) return false;
  // Agent scratch space and Atelier's own homes aren't product UI.
  const skipRoots = process.env.ATELIER_UI_GATE_SKIP_ROOTS !== undefined
    ? process.env.ATELIER_UI_GATE_SKIP_ROOTS.split(":").filter(Boolean)
    : [join(home, ".claude"), join(home, ".atelier"), join(home, ".paradigm"), "/tmp", "/private/tmp", "/private/var/folders", "/var/folders"];
  if (skipRoots.some((r) => file === r || file.startsWith(r + sep))) return false;
  const root = repoRoot(file);
  const cfg = repoConfig(root);
  if (cfg.off) return false;
  const rel = relative(root, file).split(sep).join("/");
  if ((cfg.exclude ?? []).some((p) => rel.startsWith(p))) return false;
  if ((cfg.include ?? []).some((p) => rel.startsWith(p))) return true;
  const segments = rel.split("/").slice(0, -1);
  if (segments.some((s) => SKIP_SEGMENT.test(s)) || TEST_FILE.test(file)) return false;
  const ext = extname(file).toLowerCase();
  if (STRONG_EXT.has(ext)) return true;
  return WEAK_EXT.has(ext) && segments.some((s) => UI_SEGMENT.test(s));
}

function gateDir(input) {
  const base = input.transcript_path ? dirname(input.transcript_path) : join(homedir(), ".claude", "projects", "_ui-gate");
  return join(base, "ui-gate");
}

function paths(input) {
  const dir = gateDir(input);
  const id = String(input.session_id || "unknown").replace(/[^A-Za-z0-9_-]/g, "");
  return { dir, state: join(dir, `${id}.json`), review: join(dir, `${id}-review.md`) };
}

function loadState(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { edits: {}, briefedAt: 0, blocks: 0 };
  }
}

function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2));
}

/** The .atelier/ folder that governs `file` and whether it splits the repo into products. */
function designRecord(file) {
  const root = findUp(dirname(file), ".atelier");
  if (!root) return null;
  const a = join(root, ".atelier");
  return { root, multi: existsSync(join(a, "systems.yaml")), files: ["DESIGN.md", "design-system.yaml"].map((f) => join(a, f)).filter((p) => existsSync(p)) };
}

function brief(file, reviewPath) {
  const record = designRecord(file);
  const first = !record
    ? "1. No .atelier/ design record in this repo: match the existing components and tokens of the surface you are changing (`atelier system extract` shows what exists)."
    : record.multi
      ? `1. This repo has a design system per product. Run \`atelier system which ${file}\` and follow that product's DESIGN.md and design-system.yaml before more UI edits; they outrank your defaults.`
      : `1. Follow the project's design record: ${record.files.join(", ")}. Read it before more UI edits if you haven't; it outranks your defaults.`;
  return [
    `Atelier UI gate: you changed UI (${file}). UI here is vetted before it is called done:`,
    first,
    "2. Get an independent review, not a self-check: spawn the `atelier-mika` agent (or any fresh agent told to act as Mika) to run her ui-build-protocol (~/.paradigm/agents/designer.agent) on every UI file you changed, looking at it rendered at narrow, normal and wide widths with real, long, empty and error content, and running `atelier check <files>` where a design system exists.",
    "3. Apply the fixes she proposes, then save her review to:",
    `   ${reviewPath}`,
    `   with these ## sections: ${HEADINGS.join(", ")}. Files lists every changed UI file; Rendered names the screenshots taken (or "not rendered: <why>"); Verdict is approved or approved-with-fixes.`,
    "   Not a visual change (types, logic, a comment)? Write one line instead: `Waived: <why>`.",
    "Fix and re-review on your own; show the founder the reviewed result, not each iteration, unless they ask.",
  ].join("\n");
}

/** Check a review file against the pending files. Returns a list of problems. Exported for tests. */
export function checkReview(text, pending, cwd = process.cwd()) {
  const waiver = text.match(/^\s*Waived:\s*(.+)$/im);
  if (waiver) return waiver[1].trim().length >= 8 ? [] : ["the waiver needs a reason (`Waived: <why>`)"];
  const problems = [];
  const sections = {};
  let current = null;
  for (const line of text.split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = HEADINGS.find((name) => h[1].toLowerCase().startsWith(name.toLowerCase())) ?? null;
      if (current) sections[current] = "";
    } else if (current) sections[current] += line + "\n";
  }
  const missing = HEADINGS.filter((h) => !(h in sections) || !sections[h].trim());
  if (missing.length) problems.push(`empty or missing sections: ${missing.join(", ")}`);
  const unnamed = pending.filter((f) => !text.includes(basename(f)));
  if (unnamed.length) problems.push(`the review doesn't cover: ${unnamed.join(", ")}`);
  const verdict = (sections.Verdict ?? "").toLowerCase();
  if (/rework/.test(verdict)) problems.push("the verdict is rework: fix the work and review it again");
  else if (verdict.trim() && !/approved/.test(verdict)) problems.push("the verdict must say approved or approved-with-fixes");
  const rendered = sections.Rendered ?? "";
  if (rendered.trim() && !/not rendered:\s*\S/i.test(rendered)) {
    const shots = [...rendered.matchAll(/([^\s`'"()<>\[\]]+\.(?:png|jpe?g|webp|gif))/gi)].map((m) => m[1]);
    const real = shots.filter((p) => existsSync(isAbsolute(p) ? p : join(cwd, p)));
    if (!real.length) problems.push('Rendered names no screenshot that exists on disk (or say "not rendered: <why>")');
  }
  return problems;
}

function post(input) {
  const tool = input.tool_name;
  if (!["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) return;
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!isUiFile(file)) return;
  const p = paths(input);
  const state = loadState(p.state);
  const now = Date.now();
  state.edits[file] = now;
  const reviewedAt = existsSync(p.review) ? statSync(p.review).mtimeMs : 0;
  // Brief once per session, and again when UI edits resume after a review.
  const needsBrief = !state.briefedAt || (reviewedAt && state.briefedAt < reviewedAt);
  if (needsBrief) state.briefedAt = now;
  saveState(p.state, state);
  if (needsBrief) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: brief(file, p.review) } }));
  }
}

function stop(input) {
  const p = paths(input);
  if (!existsSync(p.state)) return;
  const state = loadState(p.state);
  const reviewedAt = existsSync(p.review) ? statSync(p.review).mtimeMs : 0;
  const pending = Object.entries(state.edits).filter(([, at]) => at > reviewedAt).map(([f]) => f);
  const problems = [];
  if (reviewedAt) {
    const text = readFileSync(p.review, "utf8");
    // A fresh review must cover every UI file changed this session.
    problems.push(...checkReview(text, pending.length ? Object.keys(state.edits) : [], input.cwd));
  }
  if (!pending.length && !problems.length) {
    if (state.blocks) saveState(p.state, { ...state, blocks: 0 });
    return;
  }
  if (input.stop_hook_active && state.blocks >= MAX_BLOCKS) {
    appendFileSync(join(p.dir, "bypass.jsonl"), JSON.stringify({ at: new Date().toISOString(), session: input.session_id, pending, problems }) + "\n");
    saveState(p.state, { ...state, blocks: 0 });
    return;
  }
  saveState(p.state, { ...state, blocks: (state.blocks ?? 0) + 1 });
  const reason = [
    pending.length
      ? `Atelier UI gate: UI changed without a review: ${pending.join(", ")}.`
      : "Atelier UI gate: the UI review isn't complete yet.",
    ...problems.map((x) => `- ${x}`),
    `Have Mika (atelier-mika) review it as described earlier, apply her fixes, and save the review to ${p.review}.`,
    "If the change isn't visual, write `Waived: <why>` in that file instead.",
  ].join("\n");
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (process.env.ATELIER_UI_GATE === "off") process.exit(0);
  try {
    const input = readStdin();
    if (process.argv[2] === "post") post(input);
    else if (process.argv[2] === "stop") stop(input);
  } catch {
    // A broken gate must never break the session.
  }
  process.exit(0);
}
