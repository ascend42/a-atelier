// #workspace scaffold tests — lock the invariants the post-loss retro
// surfaced (RETROSPECTIVE-2026-05-28-ascend-brand-establishment.md):
//   1. cascade-merge.md MUST land in the scaffolded workspace — the persona
//      shims + CLAUDE.md link to it as a workspace-relative path.
//   2. No shim may reference an in-workspace `.paradigm/personas/<p>/skills/`
//      path, because those skill files are NOT shipped (the design references
//      the global ~/.paradigm/ notebooks as canonical). A bare workspace-local
//      skills reference would be a dangling pointer for a fresh creator.
//   3. Re-scaffold refreshes templated reference docs without clobbering
//      creator-authored artifacts (DESIGN/SCRIPT/STORYBOARD).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { scaffoldWorkspace } from "./workspace.js";
import { createWorkspace, findWorkspace, projectsDir, readWorkspace, writeWorkspace } from "../lib/workspace.js";
import { buildWorkspaceInfo, studioContext } from "./studio.js";
import { writeLearningMode } from "../lib/learning-mode.js";

// src/commands/ → ../../ = packages/cli ; ../../../../ = repo root
const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = join(testDir, "..", "..");
const repoRoot = join(cliDir, "..", "..");

let wsDir: string;

beforeEach(() => {
  wsDir = mkdtempSync(join(tmpdir(), "atelier-workspace-scaffold-test-"));
});

afterEach(() => {
  rmSync(wsDir, { recursive: true, force: true });
});

describe("scaffoldWorkspace", () => {
  it("ships cascade-merge.md at the path the shims + CLAUDE.md reference", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    const cascade = join(wsDir, ".paradigm/personas/_shared/cascade-merge.md");
    expect(existsSync(cascade)).toBe(true);
    expect(readFileSync(cascade, "utf8")).toContain("Brand cascade");
  });

  it("the shipped cascade-merge is byte-identical to the repo canonical (drift guard)", () => {
    // The template carries a static copy of the canonical protocol doc. There is
    // no bundle-time regen, so this equality is the ONLY thing preventing the
    // copy from silently going stale as the canonical is rewritten — the exact
    // bug class (stale duplicate) the source retro was written about.
    const canonical = readFileSync(
      join(repoRoot, ".paradigm/personas/_shared/cascade-merge.md"),
      "utf8",
    );
    const templateCopy = readFileSync(
      join(cliDir, "templates/workspace/.paradigm/personas/_shared/cascade-merge.md"),
      "utf8",
    );
    expect(templateCopy).toBe(canonical);
  });

  it("ships the SETUP runbook and routes 'get me set up' to it from CLAUDE.md", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    const setup = join(wsDir, "SETUP.md");
    expect(existsSync(setup)).toBe(true);
    const setupBody = readFileSync(setup, "utf8");
    // The runbook must cover the render-critical prerequisites and lean on the
    // verified Hyperframes-native checker (`hyperframes doctor` covers ffmpeg +
    // ffprobe + Chrome). Chrome is render-critical and easy to forget.
    for (const required of ["Node", "Hyperframes", "doctor", "ffmpeg", "Chrome"]) {
      expect(setupBody).toContain(required);
    }

    // CLAUDE.md must wire the trigger phrase to the runbook, or the creator's
    // "get me set up" request won't reliably reach SETUP.md.
    const claudeMd = readFileSync(join(wsDir, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("SETUP.md");
    expect(/get (me )?set ?up/i.test(claudeMd)).toBe(true);
  });

  it("scaffolds the three persona shims", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    for (const p of ["quill", "lux", "iris"]) {
      expect(existsSync(join(wsDir, `.claude/agents/atelier-${p}.md`))).toBe(true);
    }
  });

  it("no shim references an in-workspace skills path that isn't shipped", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    for (const p of ["quill", "lux", "iris"]) {
      const shim = readFileSync(join(wsDir, `.claude/agents/atelier-${p}.md`), "utf8");

      // Every reference the shim makes must resolve. We only ship cascade-merge
      // under .paradigm/personas/; skills are referenced via the global notebook.
      // So any `.paradigm/personas/<p>/skills/` mention MUST be explicitly framed
      // as a dev-repo aside — never presented as the canonical workspace path.
      // (We require the "dev repo" qualifier specifically; the `~/.paradigm/
      // notebooks/` line is always present on line 19-20 so it can't discriminate.)
      const skillsRefs = shim.match(/\.paradigm\/personas\/\w+\/skills\//g) ?? [];
      if (skillsRefs.length > 0) {
        expect(
          /dev repo/i.test(shim),
          `atelier-${p}.md references an in-workspace skills path without ` +
            `framing it as a dev-repo aside`,
        ).toBe(true);
      }

      // The cascade protocol it links to must actually exist in the workspace.
      if (shim.includes(".paradigm/personas/_shared/cascade-merge.md")) {
        expect(
          existsSync(join(wsDir, ".paradigm/personas/_shared/cascade-merge.md")),
        ).toBe(true);
      }
    }
  });

  it("re-scaffold refreshes cascade-merge but preserves authored brand artifacts", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    // Creator edits a brand artifact + the shipped cascade doc.
    const design = join(wsDir, "_brand/DESIGN.md");
    writeFileSync(design, "# MY AUTHORED BRAND\n");
    const cascade = join(wsDir, ".paradigm/personas/_shared/cascade-merge.md");
    writeFileSync(cascade, "stale hand-edit\n");

    const result = scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    // Authored content is preserved (skip-if-exists).
    expect(readFileSync(design, "utf8")).toBe("# MY AUTHORED BRAND\n");
    expect(result.skipped).toContain("_brand/DESIGN.md");

    // Templated reference doc is refreshed back to canonical.
    expect(readFileSync(cascade, "utf8")).toContain("Brand cascade");
    expect(result.updated).toContain(".paradigm/personas/_shared/cascade-merge.md");
  });

  it("writes .gitignore (the template ships it dotless so npm can't rename it)", () => {
    const result = scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    expect(existsSync(join(wsDir, ".gitignore"))).toBe(true);
    expect(readFileSync(join(wsDir, ".gitignore"), "utf8")).toContain("projects/*/media/");
    expect(existsSync(join(wsDir, "gitignore"))).toBe(false);
    expect(result.written).toContain(".gitignore");
  });

  it("re-scaffold keeps the creator's own .gitignore", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });
    writeFileSync(join(wsDir, ".gitignore"), "exports/\n");

    const result = scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    expect(readFileSync(join(wsDir, ".gitignore"), "utf8")).toBe("exports/\n");
    expect(result.skipped).toContain(".gitignore");
  });
});

describe("v2 workspace manifest", () => {
  it("findWorkspace reads a freshly scaffolded v2 workspace (studio/init no longer crash)", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    const ws = findWorkspace(join(wsDir, "projects"));
    expect(ws?.workspaceDir).toBe(wsDir);
    expect(ws?.manifest.name).toBe("testbrand");
    expect(ws?.manifest.default_mode).toBe("ambient");
  });

  it("takes default_mode from the workspace learning-mode file", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });
    writeLearningMode(wsDir, "explicit");

    expect(readWorkspace(wsDir).default_mode).toBe("explicit");
  });

  it("writeWorkspace leaves a v2 manifest untouched", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });
    const manifestPath = join(wsDir, "workspace.atelier");
    const before = readFileSync(manifestPath, "utf8");

    writeWorkspace(wsDir, { ...readWorkspace(wsDir), projects: ["ep1"] });

    expect(readFileSync(manifestPath, "utf8")).toBe(before);
  });

  it("a malformed learning-mode.yaml reads as ambient instead of breaking discovery", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });
    mkdirSync(join(wsDir, ".atelier"), { recursive: true });
    writeFileSync(join(wsDir, ".atelier/learning-mode.yaml"), "mode: Ambient\n");

    expect(findWorkspace(wsDir)?.manifest.default_mode).toBe("ambient");
  });

  it("createWorkspace with force replaces a v2 manifest", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });

    createWorkspace(wsDir, { mode: "explicit", name: "replaced", force: true, skipParadigmIntegration: true });

    const manifest = readWorkspace(wsDir);
    expect(manifest.name).toBe("replaced");
    expect(readFileSync(join(wsDir, "workspace.atelier"), "utf8")).not.toContain("2.0.0");
  });

  it("projectsDir is projects/ for v2 and the root for v1", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });
    expect(projectsDir(wsDir)).toBe(join(wsDir, "projects"));

    const v1 = mkdtempSync(join(tmpdir(), "atelier-v1-ws-"));
    try {
      createWorkspace(v1, { mode: "ambient", skipParadigmIntegration: true });
      expect(projectsDir(v1)).toBe(v1);
    } finally {
      rmSync(v1, { recursive: true, force: true });
    }
  });

  it("studio opens one v2 project at a time and hints at the workspace root", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });
    mkdirSync(join(wsDir, "projects/ep1/media"), { recursive: true });

    const root = studioContext(wsDir);
    expect(root.kind).toBe("v2-workspace");
    expect(root.projects).toEqual(["ep1"]);
    expect(studioContext(join(wsDir, "projects")).kind).toBe("v2-workspace");

    const inProject = studioContext(join(wsDir, "projects/ep1/media"));
    expect(inProject).toMatchObject({ kind: "project", projectDir: join(wsDir, "projects/ep1") });
  });

  it("workspace-tree endpoints answer 404 in a v2 workspace so the project editor boots", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });
    mkdirSync(join(wsDir, "projects/ep1/.atelier"), { recursive: true });

    expect(buildWorkspaceInfo(join(wsDir, "projects/ep1")).status).toBe(404);
    expect(buildWorkspaceInfo(wsDir).status).toBe(404);
  });

  it("a v2 subfolder outside projects/ is never opened as a project, even with a .atelier/ dir", () => {
    scaffoldWorkspace({ targetDir: wsDir, workspaceName: "testbrand", force: false });
    writeFileSync(join(wsDir, "_brand/intro.atelier"), "{}");
    mkdirSync(join(wsDir, "_brand/.atelier"), { recursive: true });

    expect(studioContext(join(wsDir, "_brand")).kind).toBe("v2-workspace");
  });
});
