// #workspace-delete tests — direct lib coverage for deleteProject + the
// project-lifecycle scenarios (create → delete → re-create → createDoc)
// that the user reported as "corruption" when exercising the flat-docs
// pivot through the studio UI. The lib-level pieces work; this file locks
// the invariants so we don't regress.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deleteProject } from "./workspace-delete.js";
import { createProjectInWorkspace } from "../commands/init.js";
import { createDoc, listDocs } from "./doc-management.js";

/**
 * Build a workspace with one project pre-created via the same path the
 * studio's `+ new` button uses (`createProjectInWorkspace`). Returns the
 * absolute workspace dir; tests get a fresh one each `beforeEach`.
 */
function buildWorkspace(): string {
  const wsDir = mkdtempSync(join(tmpdir(), "atelier-lifecycle-test-"));
  // Workspace manifest — the createProjectInWorkspace reader expects one.
  writeFileSync(
    join(wsDir, "workspace.atelier"),
    `version: '1.0'
name: testws
created: '2026-05-28T00:00:00.000Z'
default_mode: explicit
projects: []
`,
  );
  // `.atelier/` workspace metadata dir (active.yaml lives here when set).
  mkdirSync(join(wsDir, ".atelier"), { recursive: true });
  return wsDir;
}

/** Write active.yaml pointing at `name`. */
function setActive(wsDir: string, name: string): void {
  writeFileSync(
    join(wsDir, ".atelier", "active.yaml"),
    `version: '1.0'\nname: ${name}\nset_at: '2026-05-28T00:00:00.000Z'\n`,
  );
}

/** Read workspace.atelier's projects[] list (parsed by line — sufficient for tests). */
function projectsList(wsDir: string): string[] {
  const raw = readFileSync(join(wsDir, "workspace.atelier"), "utf-8");
  const m = raw.match(/projects:\s*\[([^\]]*)\]/);
  if (m) {
    return m[1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
  }
  const lines = raw.split("\n");
  const start = lines.findIndex((l) => l.trim() === "projects:");
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s*(.+)\s*$/);
    if (!m) break;
    out.push(m[1].trim().replace(/['"]/g, ""));
  }
  return out;
}

describe("workspace-delete — deleteProject lib", () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = buildWorkspace();
  });

  afterEach(() => {
    rmSync(wsDir, { recursive: true, force: true });
  });

  it("rm-rfs the entire project subdir including .atelier/ metadata + artifact stubs", async () => {
    await createProjectInWorkspace(wsDir, { name: "alpha" });
    const projDir = join(wsDir, "alpha");
    // Sanity: createProjectInWorkspace scaffolds artifact stubs + .atelier/ metadata
    expect(existsSync(projDir)).toBe(true);
    expect(existsSync(join(projDir, ".atelier"))).toBe(true);
    expect(existsSync(join(projDir, "DESIGN.md"))).toBe(true);

    const outcome = deleteProject(wsDir, "alpha");
    expect(outcome.kind).toBe("deleted");
    // The whole subdir is gone — not just .atelier docs, ALL of it.
    expect(existsSync(projDir)).toBe(false);
  });

  it("clears active.yaml when it pointed at the deleted project", async () => {
    await createProjectInWorkspace(wsDir, { name: "alpha" });
    setActive(wsDir, "alpha");
    expect(existsSync(join(wsDir, ".atelier", "active.yaml"))).toBe(true);

    const outcome = deleteProject(wsDir, "alpha");
    expect(outcome.kind).toBe("deleted");
    if (outcome.kind === "deleted") {
      expect(outcome.report.wasActive).toBe(true);
    }
    // active.yaml is cleared (file removed by clearActiveProject).
    expect(existsSync(join(wsDir, ".atelier", "active.yaml"))).toBe(false);
  });

  it("does NOT clear active.yaml when it pointed at a different project", async () => {
    await createProjectInWorkspace(wsDir, { name: "alpha" });
    await createProjectInWorkspace(wsDir, { name: "beta" });
    setActive(wsDir, "beta");

    const outcome = deleteProject(wsDir, "alpha");
    expect(outcome.kind).toBe("deleted");
    if (outcome.kind === "deleted") {
      expect(outcome.report.wasActive).toBe(false);
    }
    // active.yaml unchanged — beta is still active.
    expect(existsSync(join(wsDir, ".atelier", "active.yaml"))).toBe(true);
    const active = readFileSync(join(wsDir, ".atelier", "active.yaml"), "utf-8");
    expect(active).toMatch(/name:\s*beta/);
  });

  it("trims projects[] from workspace.atelier", async () => {
    await createProjectInWorkspace(wsDir, { name: "alpha" });
    await createProjectInWorkspace(wsDir, { name: "beta" });
    // After two creates, projects[] should reflect on-disk truth.
    expect(projectsList(wsDir).sort()).toEqual(["alpha", "beta"]);

    const outcome = deleteProject(wsDir, "alpha");
    expect(outcome.kind).toBe("deleted");
    if (outcome.kind === "deleted") {
      expect(outcome.report.manifestUpdated).toBe(true);
    }
    expect(projectsList(wsDir)).toEqual(["beta"]);
  });

  it("returns not-found when the project doesn't exist", () => {
    const outcome = deleteProject(wsDir, "ghost");
    expect(outcome.kind).toBe("not-found");
  });

  it("returns invalid-name for path-traversal names", () => {
    expect(deleteProject(wsDir, "../escape").kind).toBe("invalid-name");
    expect(deleteProject(wsDir, ".hidden").kind).toBe("invalid-name");
    expect(deleteProject(wsDir, "a/b").kind).toBe("invalid-name");
  });
});

describe("workspace-delete — project lifecycle (the corruption case)", () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = buildWorkspace();
  });

  afterEach(() => {
    rmSync(wsDir, { recursive: true, force: true });
  });

  it("delete → re-create → createDoc — the corruption-reported flow", async () => {
    // 1. Create.
    await createProjectInWorkspace(wsDir, { name: "test1" });
    const projDir = join(wsDir, "test1");
    expect(existsSync(projDir)).toBe(true);
    // Post-pivot: NO project.atelier auto-scaffolded — just metadata + artifact stubs.
    expect(existsSync(join(projDir, "project.atelier"))).toBe(false);
    expect(existsSync(join(projDir, ".atelier"))).toBe(true);
    expect(existsSync(join(projDir, "DESIGN.md"))).toBe(true);
    expect(listDocs(projDir)).toEqual([]);

    // 2. Delete.
    setActive(wsDir, "test1");
    const del = deleteProject(wsDir, "test1");
    expect(del.kind).toBe("deleted");
    expect(existsSync(projDir)).toBe(false);
    expect(existsSync(join(wsDir, ".atelier", "active.yaml"))).toBe(false);
    expect(projectsList(wsDir)).toEqual([]);

    // 3. Re-create with the same name.
    await createProjectInWorkspace(wsDir, { name: "test1" });
    expect(existsSync(projDir)).toBe(true);
    expect(existsSync(join(projDir, "project.atelier"))).toBe(false);
    // Fresh — zero docs.
    expect(listDocs(projDir)).toEqual([]);
    // Workspace projects[] reflects the re-creation.
    expect(projectsList(wsDir)).toEqual(["test1"]);

    // 4. Create a doc in the re-created project. This is where the user
    //    reported corruption; lock the invariant.
    const result = await createDoc({
      projectDir: projDir,
      name: "first-clip",
      kind: "video",
    });
    expect(result.docPath).toBe("first-clip.atelier");
    expect(existsSync(join(projDir, "first-clip.atelier"))).toBe(true);
    expect(listDocs(projDir)).toEqual([
      { path: "first-clip.atelier", kind: "video" },
    ]);
  });

  it("delete with docs → re-create → docs list is empty", async () => {
    await createProjectInWorkspace(wsDir, { name: "test1" });
    const projDir = join(wsDir, "test1");

    // Populate with three docs.
    await createDoc({ projectDir: projDir, name: "alpha", kind: "video" });
    await createDoc({ projectDir: projDir, name: "beta", kind: "image" });
    await createDoc({ projectDir: projDir, name: "gallery", kind: "carousel" });
    expect(listDocs(projDir).length).toBe(3);

    // Delete the project.
    setActive(wsDir, "test1");
    const del = deleteProject(wsDir, "test1");
    expect(del.kind).toBe("deleted");
    expect(existsSync(projDir)).toBe(false);
    expect(existsSync(join(wsDir, ".atelier", "active.yaml"))).toBe(false);

    // Re-create — no leftover state from the prior incarnation.
    await createProjectInWorkspace(wsDir, { name: "test1" });
    expect(listDocs(projDir)).toEqual([]);
    // Defense-in-depth: no leftover .atelier *files* from the prior delete
    // (the `.atelier/` directory IS expected — that's the metadata subdir).
    const fs = await import("node:fs");
    const leftoverDocFiles = readdirSync(projDir).filter((entry) => {
      const full = join(projDir, entry);
      return entry.endsWith(".atelier") && fs.statSync(full).isFile();
    });
    expect(leftoverDocFiles).toEqual([]);
  });

  it("listDocs returns [] for a freshly-created project (metadata only, no docs)", async () => {
    await createProjectInWorkspace(wsDir, { name: "empty" });
    const projDir = join(wsDir, "empty");
    // Has metadata + artifacts but NO docs — this is the half-lived state
    // the user encountered after deleting all docs in a project. It's a
    // legal state post-pivot; listDocs must return [] not crash.
    expect(listDocs(projDir)).toEqual([]);
  });

  it("createDoc succeeds in a project with .atelier/ metadata + no docs", async () => {
    await createProjectInWorkspace(wsDir, { name: "test1" });
    const projDir = join(wsDir, "test1");
    expect(listDocs(projDir)).toEqual([]);

    // The CRITICAL invariant: createDoc works in this half-lived state.
    const result = await createDoc({ projectDir: projDir, name: "fresh", kind: "video" });
    expect(result.docPath).toBe("fresh.atelier");
    expect(existsSync(join(projDir, "fresh.atelier"))).toBe(true);
  });

  // Regression: cascadeDeleteMedia previously required project.atelier to
  // exist (same broken check as resolveProjectInWorkspace had). Post-pivot,
  // projects can have .atelier/ metadata + media without project.atelier
  // ever being scaffolded. Media-delete right-click was silently 404'ing
  // with "invalid-project" — and the browser swallowed the error showing
  // "Deleted <name>" in the status bar. Test the lib-level fix.
  it("cascadeDeleteMedia works on a project without project.atelier (post-pivot)", async () => {
    const { cascadeDeleteMedia } = await import("./workspace-delete.js");

    await createProjectInWorkspace(wsDir, { name: "test1" });
    const projDir = join(wsDir, "test1");
    // Post-pivot — no project.atelier auto-created.
    expect(existsSync(join(projDir, "project.atelier"))).toBe(false);

    // Drop a media file in (mirrors what the ingest does on its first step).
    const fs = await import("node:fs");
    fs.mkdirSync(join(projDir, "media"), { recursive: true });
    fs.writeFileSync(join(projDir, "media", "IMG_7346.MOV"), "fake bytes");

    // Cascade-delete should succeed. Pre-fix it returned `kind: "invalid-project"`.
    const outcome = cascadeDeleteMedia(wsDir, "test1", "IMG_7346.MOV");
    expect(outcome.kind).toBe("deleted");
    expect(existsSync(join(projDir, "media", "IMG_7346.MOV"))).toBe(false);
  });

  // Regression: the user-reported "Failed to create doc: project not found:
  // test1" error after re-creating a project post-pivot. resolveProjectInWorkspace
  // used to require project.atelier; now it uses hasProjectMarker (legacy
  // file OR .atelier/ subdir). This test catches a re-regression.
  it("resolveProjectInWorkspace finds a freshly-created project even without project.atelier", async () => {
    const { resolveProjectInWorkspace } = await import("../commands/studio.js");
    await createProjectInWorkspace(wsDir, { name: "test1" });
    const projDir = join(wsDir, "test1");
    // Post-pivot: no project.atelier auto-created.
    expect(existsSync(join(projDir, "project.atelier"))).toBe(false);
    // But the project IS resolvable (via the .atelier/ metadata marker).
    const resolved = resolveProjectInWorkspace(wsDir, "test1");
    expect(resolved).toBe(projDir);
  });

  it(".atelier/ metadata directory is never surfaced as a doc by listDocs", async () => {
    await createProjectInWorkspace(wsDir, { name: "test1" });
    const projDir = join(wsDir, "test1");
    // listDocs must filter the `.atelier/` directory (the bug fix this
    // pivot shipped). Defense-in-depth: even with metadata present,
    // the docs list is empty.
    expect(listDocs(projDir)).toEqual([]);
    // And after adding a real doc, only the real doc surfaces (not .atelier/).
    await createDoc({ projectDir: projDir, name: "real", kind: "video" });
    const docs = listDocs(projDir);
    expect(docs).toHaveLength(1);
    expect(docs[0].path).toBe("real.atelier");
  });
});
