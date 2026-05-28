// #studio-docs-http — handler-level tests for the doc-management HTTP
// surface (Unit C of the v1.0.x doc-management bundle).
//
// Tests exercise the pure handlers exported from `./studio.js` directly
// against a real workspace tmpdir — no Vite, no HTTP, no WS. Cascade
// invariants (SlideRef scrub, RefVisual dangling report) are covered by
// the integration-shape assertions in handleDeleteDoc; deeper unit coverage
// lives in the doc-management.ts test file that Kit-A ships alongside.
//
// Path-traversal posture: every input the HTTP layer accepts is exercised
// at least once with a malicious payload (parent-dir, leading slash, null
// byte, dotfile leader). Matches the Aegis surface declared in studio.ts
// (`validateProjectRelativeDocPath`) and rename-media.ts.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildProjectDocs,
  handleCreateDoc,
  handleDuplicateDoc,
  handleDeleteDoc,
  matchProjectDocsRoute,
  matchProjectDocsDuplicateRoute,
} from "./studio.js";

import type { AtelierDocument } from "@a-company/atelier-types";

// ── Test fixture helpers ─────────────────────────────────────────────

function makeWorkspace(): { workspaceDir: string; cleanup: () => void } {
  const workspaceDir = mkdtempSync(join(tmpdir(), "atelier-docs-test-"));
  // Minimal workspace manifest so future findWorkspace probes don't blow
  // up. Not strictly required for the handlers under test (they only
  // resolve via resolveProjectInWorkspace -> isValidProjectName).
  writeFileSync(
    join(workspaceDir, "workspace.atelier"),
    JSON.stringify({ version: "1.0", name: "test", default_mode: "studio" }, null, 2),
  );
  return {
    workspaceDir,
    cleanup: () => rmSync(workspaceDir, { recursive: true, force: true }),
  };
}

function makeProject(
  workspaceDir: string,
  name: string,
  manifest: Partial<AtelierDocument> = {},
): string {
  const projectDir = join(workspaceDir, name);
  mkdirSync(projectDir, { recursive: true });
  const doc: AtelierDocument = {
    version: "1.0",
    name,
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [],
    states: { default: { duration: 1, deltas: [] } },
    ...manifest,
  };
  writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(doc, null, 2));
  return projectDir;
}

// ── matchProjectDocsRoute / matchProjectDocsDuplicateRoute ───────────

describe("matchProjectDocsRoute", () => {
  it("matches the bare /docs path and returns the project name", () => {
    expect(matchProjectDocsRoute("/api/project/test1/docs")).toEqual({ name: "test1" });
  });

  it("does NOT match /docs/duplicate (different matcher)", () => {
    expect(matchProjectDocsRoute("/api/project/test1/docs/duplicate")).toBeNull();
  });

  it("does NOT match unrelated paths", () => {
    expect(matchProjectDocsRoute("/api/project/test1/media")).toBeNull();
    expect(matchProjectDocsRoute("/api/file")).toBeNull();
    expect(matchProjectDocsRoute("/api/project//docs")).toBeNull();
  });

  it("decodes URL-encoded project names", () => {
    expect(matchProjectDocsRoute("/api/project/my%20proj/docs")).toEqual({ name: "my proj" });
  });
});

describe("matchProjectDocsDuplicateRoute", () => {
  it("matches the /docs/duplicate path", () => {
    expect(matchProjectDocsDuplicateRoute("/api/project/test1/docs/duplicate")).toEqual({
      name: "test1",
    });
  });

  it("does NOT match the bare /docs path", () => {
    expect(matchProjectDocsDuplicateRoute("/api/project/test1/docs")).toBeNull();
  });

  it("does NOT match unrelated paths", () => {
    expect(matchProjectDocsDuplicateRoute("/api/project/test1/duplicate")).toBeNull();
    expect(matchProjectDocsDuplicateRoute("/api/project//docs/duplicate")).toBeNull();
  });
});

// ── buildProjectDocs ─────────────────────────────────────────────────

describe("buildProjectDocs", () => {
  let workspaceDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ workspaceDir, cleanup } = makeWorkspace());
  });
  afterEach(() => cleanup());

  it("returns a single manifest entry for a manifest-only project", () => {
    makeProject(workspaceDir, "demo", { kind: "video" });
    const result = buildProjectDocs(workspaceDir, "demo");
    expect(result.status).toBe(200);
    const body = result.body as Array<{ path: string; role: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ path: "project.atelier", role: "manifest" });
  });

  it("returns ordered manifest + slide entries for a carousel", () => {
    const projectDir = makeProject(workspaceDir, "carousel-demo", {
      kind: "carousel",
      slides: [
        { src: "slides/one.atelier" },
        { src: "slides/two.atelier", label: "Slide Two" },
      ],
    });
    mkdirSync(join(projectDir, "slides"), { recursive: true });
    writeFileSync(
      join(projectDir, "slides", "one.atelier"),
      JSON.stringify({
        version: "1.0",
        name: "one",
        kind: "image",
        canvas: { width: 1, height: 1, fps: 30 },
        layers: [],
        states: { default: { duration: 1, deltas: [] } },
      }),
    );
    writeFileSync(
      join(projectDir, "slides", "two.atelier"),
      JSON.stringify({
        version: "1.0",
        name: "two",
        kind: "video",
        canvas: { width: 1, height: 1, fps: 30 },
        layers: [],
        states: { default: { duration: 1, deltas: [] } },
      }),
    );

    const result = buildProjectDocs(workspaceDir, "carousel-demo");
    expect(result.status).toBe(200);
    const body = result.body as Array<{ path: string; role: string; slideIndex?: number; slideLabel?: string }>;
    expect(body.map((e) => ({ path: e.path, role: e.role }))).toEqual([
      { path: "project.atelier", role: "manifest" },
      { path: "slides/one.atelier", role: "slide" },
      { path: "slides/two.atelier", role: "slide" },
    ]);
    expect(body[1]!.slideIndex).toBe(0);
    expect(body[2]!.slideIndex).toBe(1);
    expect(body[2]!.slideLabel).toBe("Slide Two");
  });

  it("404s when the project does not exist", () => {
    const result = buildProjectDocs(workspaceDir, "ghost");
    expect(result.status).toBe(404);
  });

  it("404s when the project name escapes the workspace", () => {
    const result = buildProjectDocs(workspaceDir, "../escape");
    expect(result.status).toBe(404);
  });
});

// ── handleCreateDoc ──────────────────────────────────────────────────

describe("handleCreateDoc", () => {
  let workspaceDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ workspaceDir, cleanup } = makeWorkspace());
    makeProject(workspaceDir, "demo", { kind: "video" });
  });
  afterEach(() => cleanup());

  it("creates a video doc at the project root and returns docPath", async () => {
    const result = await handleCreateDoc(workspaceDir, "demo", {
      name: "Hello Doc",
      kind: "video",
    });
    expect(result.status).toBe(201);
    const body = result.body as { docPath: string };
    expect(body.docPath).toBe("hello-doc.atelier");
    expect(existsSync(join(workspaceDir, "demo", "hello-doc.atelier"))).toBe(true);
  });

  it("creates an image doc with the right scaffolding", async () => {
    const result = await handleCreateDoc(workspaceDir, "demo", {
      name: "An Image",
      kind: "image",
    });
    expect(result.status).toBe(201);
    const onDisk = JSON.parse(
      readFileSync(join(workspaceDir, "demo", "an-image.atelier"), "utf-8"),
    ) as AtelierDocument;
    expect(onDisk.kind).toBe("image");
  });

  it("400s on an invalid doc name (path traversal substring)", async () => {
    const result = await handleCreateDoc(workspaceDir, "demo", {
      name: "../escape",
      kind: "video",
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: expect.stringMatching(/invalid doc name/i) });
  });

  it("400s on an invalid doc name (empty)", async () => {
    const result = await handleCreateDoc(workspaceDir, "demo", { name: "", kind: "video" });
    expect(result.status).toBe(400);
  });

  it("400s on an invalid doc name (control byte)", async () => {
    const result = await handleCreateDoc(workspaceDir, "demo", {
      name: "bad\x00name",
      kind: "video",
    });
    expect(result.status).toBe(400);
  });

  it("400s on an unrecognised kind", async () => {
    const result = await handleCreateDoc(workspaceDir, "demo", {
      name: "Whatever",
      kind: "something-else",
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: expect.stringMatching(/invalid doc kind/i) });
  });

  it("400s on a missing body", async () => {
    const result = await handleCreateDoc(workspaceDir, "demo", null);
    expect(result.status).toBe(400);
  });

  it("creates a carousel slide and appends a SlideRef when asCarouselSlide=true", async () => {
    // Switch the project to a carousel-kind manifest first.
    const carouselDoc: AtelierDocument = {
      version: "1.0",
      name: "demo",
      kind: "carousel",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 1, deltas: [] } },
      slides: [],
    };
    writeFileSync(
      join(workspaceDir, "demo", "project.atelier"),
      JSON.stringify(carouselDoc, null, 2),
    );

    const result = await handleCreateDoc(workspaceDir, "demo", {
      name: "First Slide",
      kind: "image",
      asCarouselSlide: true,
    });
    expect(result.status).toBe(201);
    const body = result.body as { docPath: string; appendedSlideIndex?: number };
    expect(body.docPath).toBe("slides/first-slide.atelier");
    expect(body.appendedSlideIndex).toBe(0);
    expect(existsSync(join(workspaceDir, "demo", "slides", "first-slide.atelier"))).toBe(true);

    const manifest = JSON.parse(
      readFileSync(join(workspaceDir, "demo", "project.atelier"), "utf-8"),
    ) as AtelierDocument;
    expect(manifest.slides).toHaveLength(1);
  });

  it("404s when the project does not exist", async () => {
    const result = await handleCreateDoc(workspaceDir, "ghost", { name: "x", kind: "video" });
    expect(result.status).toBe(404);
  });

  it("404s when the project name escapes the workspace", async () => {
    // Spec asked for 400, but for codebase consistency we surface invalid
    // project names as 404 via resolveProjectInWorkspace returning null —
    // mirrors handleDeleteProjectMedia / buildProjectMedia / etc.
    const result = await handleCreateDoc(workspaceDir, "../escape", { name: "x", kind: "video" });
    expect(result.status).toBe(404);
  });

  it("400s on a traversal carouselDocPath", async () => {
    const result = await handleCreateDoc(workspaceDir, "demo", {
      name: "Foo",
      kind: "image",
      asCarouselSlide: true,
      carouselDocPath: "../../etc/passwd",
    });
    expect(result.status).toBe(400);
  });
});

// ── handleDuplicateDoc ───────────────────────────────────────────────

describe("handleDuplicateDoc", () => {
  let workspaceDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ workspaceDir, cleanup } = makeWorkspace());
    const projectDir = makeProject(workspaceDir, "demo", { kind: "video" });
    // Add a non-manifest doc to duplicate.
    const childDoc: AtelierDocument = {
      version: "1.0",
      name: "child",
      kind: "video",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 1, deltas: [] } },
    };
    writeFileSync(join(projectDir, "child.atelier"), JSON.stringify(childDoc, null, 2));
  });
  afterEach(() => cleanup());

  it("duplicates an existing doc with a -copy suffix", async () => {
    const result = await handleDuplicateDoc(workspaceDir, "demo", "child.atelier", null);
    expect(result.status).toBe(200);
    const body = result.body as { sourceDocPath: string; newDocPath: string };
    expect(body.sourceDocPath).toBe("child.atelier");
    expect(body.newDocPath).toBe("child-copy.atelier");
    expect(existsSync(join(workspaceDir, "demo", "child-copy.atelier"))).toBe(true);
  });

  it("404s when the source doc does not exist", async () => {
    const result = await handleDuplicateDoc(workspaceDir, "demo", "missing.atelier", null);
    expect(result.status).toBe(404);
  });

  it("400s when asked to duplicate the project manifest", async () => {
    const result = await handleDuplicateDoc(workspaceDir, "demo", "project.atelier", null);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: expect.stringMatching(/manifest/i) });
  });

  it("400s on a parent-dir traversal path", async () => {
    const result = await handleDuplicateDoc(workspaceDir, "demo", "../escape.atelier", null);
    expect(result.status).toBe(400);
  });

  it("400s on an absolute path", async () => {
    const result = await handleDuplicateDoc(workspaceDir, "demo", "/etc/passwd", null);
    expect(result.status).toBe(400);
  });

  it("400s on a null path", async () => {
    const result = await handleDuplicateDoc(workspaceDir, "demo", null, null);
    expect(result.status).toBe(400);
  });

  it("404s when the project does not exist", async () => {
    const result = await handleDuplicateDoc(workspaceDir, "ghost", "child.atelier", null);
    expect(result.status).toBe(404);
  });
});

// ── handleDeleteDoc ──────────────────────────────────────────────────

describe("handleDeleteDoc", () => {
  let workspaceDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ workspaceDir, cleanup } = makeWorkspace());
    const projectDir = makeProject(workspaceDir, "demo", { kind: "video" });
    const childDoc: AtelierDocument = {
      version: "1.0",
      name: "child",
      kind: "video",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 1, deltas: [] } },
    };
    writeFileSync(join(projectDir, "child.atelier"), JSON.stringify(childDoc, null, 2));
  });
  afterEach(() => cleanup());

  it("deletes a valid doc and returns the cascade report", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", "child.atelier");
    expect(result.status).toBe(200);
    const body = result.body as { docPath: string; slideRefsRemoved: unknown[]; refLayersDangling: unknown[] };
    expect(body.docPath).toBe("child.atelier");
    expect(Array.isArray(body.slideRefsRemoved)).toBe(true);
    expect(Array.isArray(body.refLayersDangling)).toBe(true);
    expect(existsSync(join(workspaceDir, "demo", "child.atelier"))).toBe(false);
  });

  it("400s when asked to delete the project manifest (BEFORE any fs call)", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", "project.atelier");
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: expect.stringMatching(/manifest/i) });
    // Manifest should still exist.
    expect(existsSync(join(workspaceDir, "demo", "project.atelier"))).toBe(true);
  });

  it("400s on a parent-dir traversal path", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", "../etc/passwd");
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: expect.stringMatching(/invalid path/i) });
  });

  it("400s on a leading-slash absolute path", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", "/etc/passwd");
    expect(result.status).toBe(400);
  });

  it("400s on a path containing a null byte (URL-encoded)", async () => {
    // Mimics what an attacker would send over the wire; the handler decodes once.
    const result = await handleDeleteDoc(workspaceDir, "demo", "child%00.atelier");
    expect(result.status).toBe(400);
  });

  it("400s on a path containing a literal null byte", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", "child\x00.atelier");
    expect(result.status).toBe(400);
  });

  it("400s on a backslash (windows separator)", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", "slides\\foo.atelier");
    expect(result.status).toBe(400);
  });

  it("400s on a dotfile segment", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", ".hidden.atelier");
    expect(result.status).toBe(400);
  });

  it("400s on an empty path", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", "");
    expect(result.status).toBe(400);
  });

  it("400s on a null path", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", null);
    expect(result.status).toBe(400);
  });

  it("404s when the doc does not exist", async () => {
    const result = await handleDeleteDoc(workspaceDir, "demo", "nonexistent.atelier");
    expect(result.status).toBe(404);
  });

  it("404s when the project does not exist", async () => {
    const result = await handleDeleteDoc(workspaceDir, "ghost", "child.atelier");
    expect(result.status).toBe(404);
  });
});
