// #ui-gate tests — the Claude Code hook `atelier setup` installs (templates/studio/atelier/hooks/ui-gate.mjs).
// Invariants:
//   1. Only UI source counts: style/markup anywhere, scripts in UI folders; never tests, builds or scratch space.
//   2. post briefs once, records the file; stop blocks until a complete review or a waiver is newer than the edits.
//   3. After MAX_BLOCKS consecutive blocks the turn may end, and the bypass is logged.
//   4. While a requested Mika review hasn't reached a verdict (up to 30 min), Stop only advises.
//   5. A block identical to the last one (same files, edits and problems) only advises.
//   6. Stop owns edits in the session's own worktree; SubagentStop owns edits made in other worktrees.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
// @ts-expect-error plain .mjs without types
import { isUiFile, checkReview, isMikaRequest } from "../../templates/studio/atelier/hooks/ui-gate.mjs";

const hook = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "studio", "atelier", "hooks", "ui-gate.mjs");
let dir: string;
let repo: string;

function run(mode: "post" | "pre" | "stop", input: Record<string, unknown>): string {
  const r = spawnSync("node", [hook, mode], {
    input: JSON.stringify({ session_id: "s1", transcript_path: join(dir, "proj", "s1.jsonl"), cwd: repo, ...input }),
    env: { ...process.env, ATELIER_UI_GATE_SKIP_ROOTS: "" },
    encoding: "utf8",
  });
  expect(r.status).toBe(0);
  return r.stdout;
}

const review = () => join(dir, "proj", "ui-gate", "s1-review.md");
const stateFile = () => join(dir, "proj", "ui-gate", "s1.json");
const patchState = (fn: (s: Record<string, any>) => void) => {
  const s = JSON.parse(readFileSync(stateFile(), "utf8"));
  fn(s);
  writeFileSync(stateFile(), JSON.stringify(s));
};
const fullReview = (files: string, verdict: string) =>
  ["Files", "Inventory", "Consistency", "Placement", "States", "Copy", "Responsiveness", "Accessibility", "Rendered", "Verdict"]
    .map((h) => `## ${h}\n${h === "Files" ? files : h === "Rendered" ? "not rendered: test" : h === "Verdict" ? verdict : "ok"}`)
    .join("\n");
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
    // Each block differs (the review keeps changing), so none is a repeat.
    const reviews = ["Waived: no", "## Files\nheader.ts", "## Files\nheader.ts\n## Verdict\nmaybe"];
    expect(JSON.parse(run("stop", {})).decision).toBe("block");
    for (let i = 0; i < 2; i++) {
      writeFileSync(review(), reviews[i]);
      touchLater(review());
      expect(JSON.parse(run("stop", { stop_hook_active: true })).decision).toBe("block");
    }
    writeFileSync(review(), reviews[2]);
    touchLater(review());
    expect(run("stop", { stop_hook_active: true })).toBe("");
    expect(readFileSync(join(dir, "proj", "ui-gate", "bypass.jsonl"), "utf8")).toMatch(/max-blocks/);
  });

  it("an identical second block becomes advisory, whatever stop_hook_active is", () => {
    run("post", { tool_name: "Edit", tool_input: { file_path: ui() } });
    expect(JSON.parse(run("stop", {})).decision).toBe("block");
    const again = JSON.parse(run("stop", { stop_hook_active: false }));
    expect(again.decision).toBeUndefined();
    expect(again.systemMessage).toMatch(/advisory/);
    expect(readFileSync(join(dir, "proj", "ui-gate", "bypass.jsonl"), "utf8")).toMatch(/"repeat"/);
    // A new UI edit re-arms the gate.
    patchState((s) => { s.edits[ui()] -= 60_000; s.gates.main.hash = "stale"; });
    run("post", { tool_name: "Edit", tool_input: { file_path: ui() } });
    expect(JSON.parse(run("stop", {})).decision).toBe("block");
  });
});

describe("review requested", () => {
  const ui = () => join(repo, "app-gui", "src", "header.ts");

  it("recognises Mika launches only", () => {
    expect(isMikaRequest({ subagent_type: "atelier-mika", prompt: "review" })).toBe(true);
    expect(isMikaRequest({ subagent_type: "general-purpose", prompt: "Act as Mika and run her ui-build-protocol" })).toBe(true);
    expect(isMikaRequest({ subagent_type: "general-purpose", prompt: "Build the header" })).toBe(false);
    expect(isMikaRequest(undefined)).toBe(false);
  });

  it("a pending review gives an advisory, even while the review file is half written", () => {
    run("post", { tool_name: "Edit", tool_input: { file_path: ui() } });
    run("pre", { tool_name: "Agent", tool_input: { subagent_type: "atelier-mika", prompt: "review header.ts" } });
    const out = JSON.parse(run("stop", {}));
    expect(out.decision).toBeUndefined();
    expect(out.systemMessage).toMatch(/requested/);
    writeFileSync(review(), "## Files\nheader.ts\n## Inventory\n");
    touchLater(review());
    expect(JSON.parse(run("stop", {})).systemMessage).toMatch(/requested/);
  });

  it("ignores a review request made before the last edit", () => {
    run("post", { tool_name: "Edit", tool_input: { file_path: ui() } });
    patchState((s) => { s.edits[ui()] = Date.now() + 60_000; });
    run("pre", { tool_name: "Agent", tool_input: { subagent_type: "atelier-mika" } });
    expect(JSON.parse(run("stop", {})).decision).toBe("block");
  });

  it("the pending state times out after 30 minutes", () => {
    run("post", { tool_name: "Edit", tool_input: { file_path: ui() } });
    run("pre", { tool_name: "Task", tool_input: { subagent_type: "atelier-mika" } });
    patchState((s) => { s.reviewRequestedAt = Date.now() - 31 * 60_000; });
    expect(JSON.parse(run("stop", {})).decision).toBe("block");
    expect(JSON.parse(readFileSync(stateFile(), "utf8")).reviewRequestedAt).toBeUndefined();
  });

  it("a rework verdict still blocks, and again after a re-edit", () => {
    run("post", { tool_name: "Edit", tool_input: { file_path: ui() } });
    patchState((s) => { s.edits[ui()] = Date.now() - 60_000; });
    run("pre", { tool_name: "Agent", tool_input: { subagent_type: "atelier-mika" } });
    patchState((s) => { s.reviewRequestedAt = Date.now() - 30_000; });
    writeFileSync(review(), fullReview("header.ts", "rework"));
    const first = JSON.parse(run("stop", {}));
    expect(first.decision).toBe("block");
    expect(first.reason).toMatch(/rework/);
    run("post", { tool_name: "Edit", tool_input: { file_path: ui() } });
    const second = JSON.parse(run("stop", {}));
    expect(second.decision).toBe("block");
    expect(second.reason).toMatch(/header.ts/);
  });
});

describe("worktrees", () => {
  let wt: string;
  const mainUi = () => join(repo, "app-gui", "src", "header.ts");
  const wtUi = () => join(wt, "app-gui", "src", "footer.ts");

  beforeEach(() => {
    wt = join(dir, "repo-wt");
    mkdirSync(join(wt, "app-gui", "src"), { recursive: true });
    writeFileSync(join(wt, ".git"), "gitdir: ../repo/.git/worktrees/repo-wt\n");
  });

  it("a worktree edit is excluded from the main Stop", () => {
    run("post", { tool_name: "Edit", tool_input: { file_path: wtUi() } });
    expect(run("stop", { hook_event_name: "Stop" })).toBe("");
    run("post", { tool_name: "Edit", tool_input: { file_path: mainUi() } });
    const out = JSON.parse(run("stop", { hook_event_name: "Stop" }));
    expect(out.decision).toBe("block");
    expect(out.reason).toMatch(/header\.ts/);
    expect(out.reason).not.toMatch(/footer\.ts/);
    // A review naming only the main file satisfies the main Stop.
    writeFileSync(review(), fullReview("header.ts", "approved"));
    touchLater(review());
    expect(run("stop", { hook_event_name: "Stop" })).toBe("");
  });

  it("SubagentStop blocks the builder that edited a worktree", () => {
    run("post", { tool_name: "Edit", tool_input: { file_path: wtUi() } });
    const out = JSON.parse(run("stop", { hook_event_name: "SubagentStop" }));
    expect(out.decision).toBe("block");
    expect(out.reason).toMatch(/footer\.ts/);
    writeFileSync(review(), fullReview("footer.ts", "approved"));
    touchLater(review());
    expect(run("stop", { hook_event_name: "SubagentStop" })).toBe("");
  });

  it("SubagentStop owns a subagent's own edits when Claude Code names the agent", () => {
    run("post", { tool_name: "Edit", agent_id: "builder-1", tool_input: { file_path: mainUi() } });
    expect(run("stop", { hook_event_name: "SubagentStop", agent_id: "explorer-2" })).toBe("");
    expect(JSON.parse(run("stop", { hook_event_name: "SubagentStop", agent_id: "builder-1" })).decision).toBe("block");
  });
});
