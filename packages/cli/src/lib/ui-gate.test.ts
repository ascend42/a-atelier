// #ui-gate tests — the Claude Code hook `atelier setup` installs (templates/studio/atelier/hooks/ui-gate.mjs).
// Invariants:
//   1. Only UI source counts: style/markup anywhere, scripts in UI folders; never tests, builds or scratch space.
//   2. post briefs once, records the file; stop blocks until a complete review or a waiver is newer than the edits.
//   3. After MAX_BLOCKS consecutive blocks the turn may end, and the bypass is logged.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
// @ts-expect-error plain .mjs without types
import { isUiFile, checkReview } from "../../templates/studio/atelier/hooks/ui-gate.mjs";

const hook = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "studio", "atelier", "hooks", "ui-gate.mjs");
let dir: string;
let repo: string;

function run(mode: "post" | "stop", input: Record<string, unknown>): string {
  const r = spawnSync("node", [hook, mode], {
    input: JSON.stringify({ session_id: "s1", transcript_path: join(dir, "proj", "s1.jsonl"), cwd: repo, ...input }),
    env: { ...process.env, ATELIER_UI_GATE_SKIP_ROOTS: "" },
    encoding: "utf8",
  });
  expect(r.status).toBe(0);
  return r.stdout;
}

const review = () => join(dir, "proj", "ui-gate", "s1-review.md");
const touchLater = (f: string) => utimesSync(f, new Date(Date.now() + 5000), new Date(Date.now() + 5000));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atelier-gate-"));
  repo = join(dir, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  mkdirSync(join(repo, "app-gui", "src"), { recursive: true });
  mkdirSync(join(repo, ".atelier"));
  writeFileSync(join(repo, ".atelier", "DESIGN.md"), "# D\n");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("isUiFile", () => {
  it("counts style, markup and UI-folder scripts only", () => {
    process.env.ATELIER_UI_GATE_SKIP_ROOTS = "";
    try {
      expect(isUiFile(join(repo, "app-gui", "src", "header.ts"))).toBe(true);
      expect(isUiFile(join(repo, "src", "a.css"))).toBe(true);
      expect(isUiFile(join(repo, "src", "server", "db.ts"))).toBe(false);
      expect(isUiFile(join(repo, "app-gui", "src", "header.test.ts"))).toBe(false);
      expect(isUiFile(join(repo, "dist", "a.css"))).toBe(false);
    } finally {
      delete process.env.ATELIER_UI_GATE_SKIP_ROOTS;
    }
    expect(isUiFile("/private/tmp/x/page.html")).toBe(false);
  });

  it("honours a repo's ui-gate.json", () => {
    process.env.ATELIER_UI_GATE_SKIP_ROOTS = "";
    try {
      writeFileSync(join(repo, ".atelier", "ui-gate.json"), JSON.stringify({ off: true }));
      expect(isUiFile(join(repo, "src", "a.css"))).toBe(false);
    } finally {
      delete process.env.ATELIER_UI_GATE_SKIP_ROOTS;
    }
  });
});

describe("checkReview", () => {
  const full = (verdict: string, rendered: string) =>
    ["Files", "Inventory", "Consistency", "Placement", "States", "Copy", "Responsiveness", "Accessibility", "Rendered", "Verdict"]
      .map((h) => `## ${h}\n${h === "Files" ? "header.ts" : h === "Rendered" ? rendered : h === "Verdict" ? verdict : "ok"}`)
      .join("\n");

  it("accepts a waiver with a reason, rejects one without", () => {
    expect(checkReview("Waived: renamed a type alias", ["/a/header.ts"])).toEqual([]);
    expect(checkReview("Waived: no", ["/a/header.ts"])).toHaveLength(1);
  });

  it("needs every section, every file, an approved verdict and real screenshots", () => {
    expect(checkReview("## Files\nheader.ts\n## Verdict\napproved", ["/a/header.ts"])[0]).toMatch(/missing sections/);
    expect(checkReview(full("approved", "not rendered: TUI only"), ["/a/header.ts", "/a/footer.ts"])[0]).toMatch(/footer.ts/);
    expect(checkReview(full("rework", "not rendered: TUI only"), ["/a/header.ts"])[0]).toMatch(/rework/);
    expect(checkReview(full("approved", "/nope/shot.png"), ["/a/header.ts"])[0]).toMatch(/screenshot/);
    const shot = join(dir, "shot.png");
    writeFileSync(shot, "");
    expect(checkReview(full("approved-with-fixes", shot), ["/a/header.ts"])).toEqual([]);
  });
});

describe("hook flow", () => {
  const ui = () => join(repo, "app-gui", "src", "header.ts");

  it("briefs once, then blocks until a waiver, and re-gates new edits", () => {
    expect(run("stop", {})).toBe("");
    const first = run("post", { tool_name: "Edit", tool_input: { file_path: ui() } });
    expect(JSON.parse(first).hookSpecificOutput.additionalContext).toMatch(/atelier-mika/);
    expect(run("post", { tool_name: "Edit", tool_input: { file_path: ui() } })).toBe("");
    expect(JSON.parse(run("stop", {})).decision).toBe("block");
    writeFileSync(review(), "Waived: only a type rename");
    touchLater(review());
    expect(run("stop", {})).toBe("");
  });

  it("ignores non-UI edits entirely", () => {
    expect(run("post", { tool_name: "Write", tool_input: { file_path: join(repo, "src", "server", "db.ts") } })).toBe("");
    expect(existsSync(join(dir, "proj", "ui-gate", "s1.json"))).toBe(false);
  });

  it("lets the turn end after repeated blocks and logs the bypass", () => {
    run("post", { tool_name: "Edit", tool_input: { file_path: ui() } });
    for (let i = 0; i < 3; i++) expect(JSON.parse(run("stop", { stop_hook_active: i > 0 })).decision).toBe("block");
    expect(run("stop", { stop_hook_active: true })).toBe("");
    expect(readFileSync(join(dir, "proj", "ui-gate", "bypass.jsonl"), "utf8")).toMatch(/header.ts/);
  });
});
