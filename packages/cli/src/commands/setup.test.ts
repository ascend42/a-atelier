// #cli-setup tests — `atelier setup` installs Atelier Design into a user home.
// Invariants:
//   1. The skill + agent shim land where Claude Code discovers them and are
//      refreshed on every run.
//   2. Luna's agent state + notebook are installed once and never clobbered
//      (they accumulate learning) unless --force.
//   3. ~/.atelier/config.yaml records the home studio and preserves other keys.
//   4. The template's Luna notebook stays in lockstep with the canonical
//      persona notebook seed (drift guard).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { runSetup, findHomeStudio } from "./setup.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = join(testDir, "..", "..");
const repoRoot = join(cliDir, "..", "..");

let home: string;
let ws: string;

function makeWorkspace(dir: string): void {
  mkdirSync(join(dir, "_brand"), { recursive: true });
  writeFileSync(join(dir, "workspace.atelier"), "version: 2.0.0\n");
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "atelier-setup-home-"));
  ws = mkdtempSync(join(tmpdir(), "atelier-setup-ws-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });
});

describe("runSetup", () => {
  it("installs the atelier-design skill and the Luna agent shim", () => {
    const r = runSetup({ homeDir: home });
    const skill = join(home, ".claude/skills/atelier-design/SKILL.md");
    expect(existsSync(skill)).toBe(true);
    expect(readFileSync(skill, "utf8")).toMatch(/^---\nname: atelier-design\n/);
    expect(existsSync(join(home, ".claude/skills/atelier-design/reference/question-bank.md"))).toBe(true);
    expect(existsSync(join(home, ".claude/agents/atelier-luna.md"))).toBe(true);
    expect(r.written).toContain(".claude/skills/atelier-design/SKILL.md");
  });

  it("installs Luna's paradigm agent with a real timestamp", () => {
    runSetup({ homeDir: home });
    const agent = readFileSync(join(home, ".paradigm/agents/luna.agent"), "utf8");
    expect(agent).toContain("nickname: Luna");
    expect(agent).not.toContain("{{ISO_NOW}}");
    expect(readdirSync(join(home, ".paradigm/notebooks/luna")).length).toBeGreaterThan(0);
  });

  it("refreshes the skill but keeps learned Luna state on re-run", () => {
    runSetup({ homeDir: home });
    const notebook = join(home, ".paradigm/notebooks/luna/nb-luna-always-recommend.yaml");
    const skill = join(home, ".claude/skills/atelier-design/SKILL.md");
    writeFileSync(notebook, "appliedCount: 7\n");
    writeFileSync(skill, "stale");

    const r = runSetup({ homeDir: home });
    expect(readFileSync(notebook, "utf8")).toBe("appliedCount: 7\n");
    expect(readFileSync(skill, "utf8")).not.toBe("stale");
    expect(r.skipped).toContain(".paradigm/notebooks/luna/nb-luna-always-recommend.yaml");
    expect(r.updated).toContain(".claude/skills/atelier-design/SKILL.md");
  });

  it("--force overwrites learned Luna state", () => {
    runSetup({ homeDir: home });
    const notebook = join(home, ".paradigm/notebooks/luna/nb-luna-always-recommend.yaml");
    writeFileSync(notebook, "appliedCount: 7\n");
    runSetup({ homeDir: home, force: true });
    expect(readFileSync(notebook, "utf8")).toContain("nb-luna-always-recommend");
  });

  it("records an explicit home studio and preserves other config keys", () => {
    makeWorkspace(ws);
    mkdirSync(join(home, ".atelier"), { recursive: true });
    writeFileSync(join(home, ".atelier/config.yaml"), "telemetry: false\n");

    const r = runSetup({ homeDir: home, home: ws });
    const cfg = parseYaml(readFileSync(r.configPath, "utf8"));
    expect(cfg).toMatchObject({ home: ws, telemetry: false });
    expect(r.homeStudioSource).toBe("flag");
  });

  it("detects the home studio from a cwd inside a workspace", () => {
    makeWorkspace(ws);
    const nested = join(ws, "projects", "spring");
    mkdirSync(nested, { recursive: true });
    const r = runSetup({ homeDir: home, cwd: nested });
    expect(r.homeStudio).toBe(ws);
    expect(r.homeStudioSource).toBe("detected");
  });

  it("keeps an existing home studio when none is given or detected", () => {
    makeWorkspace(ws);
    runSetup({ homeDir: home, home: ws });
    const r = runSetup({ homeDir: home, cwd: home });
    expect(r.homeStudio).toBe(ws);
    expect(r.homeStudioSource).toBe("existing");
  });

  it("rejects a --home that is not an Atelier workspace", () => {
    expect(() => runSetup({ homeDir: home, home: ws })).toThrow(/not an Atelier workspace/);
  });
});

describe("findHomeStudio", () => {
  it("returns null outside any workspace", () => {
    expect(findHomeStudio(home)).toBeNull();
  });
});

describe("Luna template drift guard", () => {
  it("every canonical notebook entry has a templated notebook file", () => {
    const seed = parseYaml(readFileSync(join(repoRoot, ".paradigm/personas/luna/notebook.yaml"), "utf8")) as {
      entries: { id: string }[];
    };
    const templated = readdirSync(join(cliDir, "templates/design/paradigm/notebooks/luna"));
    for (const e of seed.entries) {
      expect(templated).toContain(`nb-luna-${e.id}.yaml`);
    }
    expect(templated.length).toBe(seed.entries.length);
  });
});
