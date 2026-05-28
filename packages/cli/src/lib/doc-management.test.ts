// Tests for #doc-management — createDoc, duplicateDoc, deleteDoc, listDocs.
//
// Each test seeds a fresh workspace/project tree under tmpdir() so the
// filesystem walks (workspace-wide SlideRef scrub, RefVisual dangling scan)
// see only what the test put there.
//
// Post-pivot (Wave 1): every .atelier doc is equal. There is no privileged
// manifest. Tests reflect that: project.atelier can be created, duplicated,
// and deleted like any other doc. listDocs returns a flat alphabetical list.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import type { AtelierDocument } from "@a-company/atelier-types";

import {
  createDoc,
  deleteDoc,
  duplicateDoc,
  listDocs,
} from "./doc-management.js";

let workspaceDir: string;
let projectDir: string;

function writeAtelier(absPath: string, doc: AtelierDocument): void {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, JSON.stringify(doc, null, 2));
}

function readAtelier(absPath: string): AtelierDocument {
  return JSON.parse(readFileSync(absPath, "utf-8")) as AtelierDocument;
}

function imageDoc(name: string): AtelierDocument {
  return {
    version: "1.0",
    name,
    kind: "image",
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [],
    states: { default: { duration: 1, deltas: [] } },
  };
}

function videoDoc(name: string): AtelierDocument {
  return {
    version: "1.0",
    name,
    kind: "video",
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [],
    states: { default: { duration: 1, deltas: [] } },
  };
}

function carouselDoc(name: string, slideSrcs: string[] = []): AtelierDocument {
  return {
    version: "1.0",
    name,
    kind: "carousel",
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [],
    states: { default: { duration: 1, deltas: [] } },
    slides: slideSrcs.map((src) => ({ src })),
  };
}

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "atelier-doc-mgmt-test-"));
  projectDir = join(workspaceDir, "my-project");
  mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

// ─── createDoc ──────────────────────────────────────────────────────

describe("createDoc", () => {
  it("creates a video doc at project root with correct shape", async () => {
    const r = await createDoc({
      projectDir,
      name: "intro clip",
      kind: "video",
    });
    expect(r.docPath).toBe("intro-clip.atelier");
    const persisted = readAtelier(join(projectDir, r.docPath));
    expect(persisted.kind).toBe("video");
    expect(persisted.name).toBe("intro-clip");
    expect(persisted.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(persisted.layers).toEqual([]);
    expect(persisted.states.default).toBeDefined();
    expect(persisted.states.default!.duration).toBe(1);
  });

  it("creates an image doc at project root", async () => {
    const r = await createDoc({ projectDir, name: "Cover", kind: "image" });
    expect(r.docPath).toBe("cover.atelier");
    const persisted = readAtelier(join(projectDir, r.docPath));
    expect(persisted.kind).toBe("image");
    expect(persisted.slides).toBeUndefined();
  });

  it("creates a carousel doc at project root with slides:[]", async () => {
    const r = await createDoc({
      projectDir,
      name: "deck",
      kind: "carousel",
    });
    expect(r.docPath).toBe("deck.atelier");
    const persisted = readAtelier(join(projectDir, r.docPath));
    expect(persisted.kind).toBe("carousel");
    expect(persisted.slides).toEqual([]);
  });

  it("writes a slide under slides/ AND appends SlideRef to the carousel", async () => {
    // Pre-seed the project as a carousel.
    const manifestPath = join(projectDir, "project.atelier");
    writeAtelier(manifestPath, carouselDoc("host"));

    const r = await createDoc({
      projectDir,
      name: "Slide One",
      kind: "image",
      asCarouselSlide: true,
      carouselDocPath: manifestPath,
    });

    expect(r.docPath).toBe("slides/slide-one.atelier");
    expect(r.appendedSlideIndex).toBe(0);
    expect(existsSync(join(projectDir, "slides", "slide-one.atelier"))).toBe(true);

    const manifest = readAtelier(manifestPath);
    expect(manifest.slides).toHaveLength(1);
    expect(manifest.slides![0]!.src).toBe(
      relative(workspaceDir, join(projectDir, "slides", "slide-one.atelier")),
    );
  });

  it("rolls back the new slide file when the host is not a carousel", async () => {
    // composeCarouselProject throws "project is not a carousel" when the host
    // doc has kind:"video". createDoc must unlink the freshly-written slide
    // doc so the creator isn't left with an orphan.
    const videoProjectDir = join(workspaceDir, "video-host");
    const videoManifest = join(videoProjectDir, "project.atelier");
    writeAtelier(videoManifest, videoDoc("vid"));

    await expect(
      createDoc({
        projectDir: videoProjectDir,
        name: "rebellious",
        kind: "image",
        asCarouselSlide: true,
        carouselDocPath: videoManifest,
      }),
    ).rejects.toThrow(/project is not a carousel/);

    // The new slide doc should NOT exist (rollback).
    expect(
      existsSync(join(videoProjectDir, "slides", "rebellious.atelier")),
    ).toBe(false);
  });

  it("collision-suffixes when target name already exists", async () => {
    // Pre-create intro.atelier at the project root.
    writeFileSync(
      join(projectDir, "intro.atelier"),
      JSON.stringify(imageDoc("existing"), null, 2),
    );

    const r = await createDoc({ projectDir, name: "intro", kind: "image" });
    expect(r.docPath).toBe("intro-1.atelier");
  });

  it("rejects an invalid name", async () => {
    await expect(
      createDoc({ projectDir, name: "../escape", kind: "image" }),
    ).rejects.toThrow(/invalid doc name/);
  });

  it("rejects a name that slugs to empty", async () => {
    await expect(
      createDoc({ projectDir, name: "!!!", kind: "image" }),
    ).rejects.toThrow(/invalid doc name/);
  });
});

// ─── duplicateDoc ───────────────────────────────────────────────────

describe("duplicateDoc", () => {
  it("duplicates a root doc to <stem>-copy.atelier", async () => {
    writeAtelier(join(projectDir, "intro.atelier"), imageDoc("intro"));
    const r = await duplicateDoc({
      projectDir,
      sourceDocPath: "intro.atelier",
    });
    expect(r.newDocPath).toBe("intro-copy.atelier");
    expect(existsSync(join(projectDir, "intro-copy.atelier"))).toBe(true);
  });

  it("duplicates a slide under slides/", async () => {
    const slidePath = join(projectDir, "slides", "slide-1.atelier");
    writeAtelier(slidePath, imageDoc("slide-1"));
    const r = await duplicateDoc({
      projectDir,
      sourceDocPath: "slides/slide-1.atelier",
    });
    expect(r.newDocPath).toBe("slides/slide-1-copy.atelier");
    expect(existsSync(join(projectDir, "slides", "slide-1-copy.atelier"))).toBe(true);
  });

  it("appends a SlideRef after the source index when appendSlideRef:true", async () => {
    // Carousel manifest references slide-1, slide-2 in order.
    const slide1Abs = join(projectDir, "slides", "slide-1.atelier");
    const slide2Abs = join(projectDir, "slides", "slide-2.atelier");
    writeAtelier(slide1Abs, imageDoc("slide-1"));
    writeAtelier(slide2Abs, imageDoc("slide-2"));

    const manifestPath = join(projectDir, "project.atelier");
    writeAtelier(
      manifestPath,
      carouselDoc("host", [
        relative(workspaceDir, slide1Abs),
        relative(workspaceDir, slide2Abs),
      ]),
    );

    const r = await duplicateDoc({
      projectDir,
      sourceDocPath: "slides/slide-1.atelier",
      appendSlideRef: true,
    });
    expect(r.newDocPath).toBe("slides/slide-1-copy.atelier");
    expect(r.appendedSlideIndex).toBe(1);

    const manifest = readAtelier(manifestPath);
    expect(manifest.slides).toHaveLength(3);
    expect(manifest.slides![0]!.src).toBe(relative(workspaceDir, slide1Abs));
    expect(manifest.slides![1]!.src).toBe(
      relative(workspaceDir, join(projectDir, "slides", "slide-1-copy.atelier")),
    );
    expect(manifest.slides![2]!.src).toBe(relative(workspaceDir, slide2Abs));
  });

  it("throws when appendSlideRef:true and source is not a slide", async () => {
    writeAtelier(join(projectDir, "scene.atelier"), imageDoc("scene"));
    await expect(
      duplicateDoc({
        projectDir,
        sourceDocPath: "scene.atelier",
        appendSlideRef: true,
      }),
    ).rejects.toThrow(/appendSlideRef requires a slide source/);
    // Rollback: the dup file should be gone.
    expect(existsSync(join(projectDir, "scene-copy.atelier"))).toBe(false);
  });

  it("preserves layer ids in the duplicate", async () => {
    const src = imageDoc("with-layers");
    src.layers = [
      {
        id: "layer-alpha",
        visual: { type: "group" },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      },
      {
        id: "layer-beta",
        visual: { type: "group" },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      },
    ];
    writeAtelier(join(projectDir, "src.atelier"), src);

    await duplicateDoc({
      projectDir,
      sourceDocPath: "src.atelier",
    });

    const dup = readAtelier(join(projectDir, "src-copy.atelier"));
    expect(dup.layers.map((l) => l.id)).toEqual(["layer-alpha", "layer-beta"]);
  });

  it("can duplicate project.atelier just like any other doc", async () => {
    // Post-pivot: project.atelier is not privileged.
    writeAtelier(join(projectDir, "project.atelier"), carouselDoc("host"));
    const r = await duplicateDoc({
      projectDir,
      sourceDocPath: "project.atelier",
    });
    expect(r.newDocPath).toBe("project-copy.atelier");
    expect(existsSync(join(projectDir, "project-copy.atelier"))).toBe(true);
  });

  it("throws when source doc not found", async () => {
    await expect(
      duplicateDoc({ projectDir, sourceDocPath: "ghost.atelier" }),
    ).rejects.toThrow(/source doc not found/);
  });

  it("collision-suffixes -copy → -copy-2 when -copy exists", async () => {
    writeAtelier(join(projectDir, "src.atelier"), imageDoc("src"));
    writeAtelier(join(projectDir, "src-copy.atelier"), imageDoc("src-copy"));

    const r = await duplicateDoc({
      projectDir,
      sourceDocPath: "src.atelier",
    });
    expect(r.newDocPath).toBe("src-copy-2.atelier");
  });
});

// ─── deleteDoc ──────────────────────────────────────────────────────

describe("deleteDoc", () => {
  it("removes the file and reports empty cascade when no other refs exist", () => {
    writeAtelier(join(projectDir, "scene.atelier"), imageDoc("scene"));

    const report = deleteDoc({
      workspaceDir,
      projectName: "my-project",
      docPath: "scene.atelier",
    });
    expect(report.docPath).toBe("scene.atelier");
    expect(report.slideRefsRemoved).toEqual([]);
    expect(report.refLayersDangling).toEqual([]);
    expect(existsSync(join(projectDir, "scene.atelier"))).toBe(false);
  });

  it("scrubs SlideRefs from referencing carousels across the workspace", () => {
    const slideAbs = join(projectDir, "slides", "shared.atelier");
    writeAtelier(slideAbs, imageDoc("shared"));

    // Two other projects reference the slide.
    const c1 = join(workspaceDir, "carousel-1");
    const c2 = join(workspaceDir, "carousel-2");
    const c1Manifest = join(c1, "project.atelier");
    const c2Manifest = join(c2, "project.atelier");
    writeAtelier(
      c1Manifest,
      carouselDoc("c1", [
        relative(workspaceDir, slideAbs),
        "carousel-1/other.atelier", // a non-matching slide we'll leave alone
      ]),
    );
    // Pre-write the c1 sibling so its slide resolves.
    writeAtelier(join(c1, "other.atelier"), imageDoc("other"));
    writeAtelier(
      c2Manifest,
      carouselDoc("c2", [
        "carousel-2/keep.atelier",
        relative(workspaceDir, slideAbs),
      ]),
    );
    writeAtelier(join(c2, "keep.atelier"), imageDoc("keep"));

    const report = deleteDoc({
      workspaceDir,
      projectName: "my-project",
      docPath: "slides/shared.atelier",
    });

    expect(report.slideRefsRemoved).toEqual(
      expect.arrayContaining([
        { project: "carousel-1", slideIndex: 0 },
        { project: "carousel-2", slideIndex: 1 },
      ]),
    );
    expect(report.slideRefsRemoved).toHaveLength(2);

    const c1Persisted = readAtelier(c1Manifest);
    expect(c1Persisted.slides).toHaveLength(1);
    expect(c1Persisted.slides![0]!.src).toBe("carousel-1/other.atelier");

    const c2Persisted = readAtelier(c2Manifest);
    expect(c2Persisted.slides).toHaveLength(1);
    expect(c2Persisted.slides![0]!.src).toBe("carousel-2/keep.atelier");
  });

  it("reports PRE-removal indices when a carousel refs the same doc multiple times", () => {
    const slideAbs = join(projectDir, "slides", "repeated.atelier");
    writeAtelier(slideAbs, imageDoc("repeated"));

    const otherProject = join(workspaceDir, "carousel-x");
    const otherManifest = join(otherProject, "project.atelier");
    writeAtelier(join(otherProject, "a.atelier"), imageDoc("a"));
    writeAtelier(join(otherProject, "b.atelier"), imageDoc("b"));
    writeAtelier(
      otherManifest,
      carouselDoc("x", [
        "carousel-x/a.atelier",
        relative(workspaceDir, slideAbs), // pre-index 1
        "carousel-x/b.atelier",
        relative(workspaceDir, slideAbs), // pre-index 3
      ]),
    );

    const report = deleteDoc({
      workspaceDir,
      projectName: "my-project",
      docPath: "slides/repeated.atelier",
    });

    expect(report.slideRefsRemoved).toEqual([
      { project: "carousel-x", slideIndex: 1 },
      { project: "carousel-x", slideIndex: 3 },
    ]);
    const persisted = readAtelier(otherManifest);
    expect(persisted.slides).toHaveLength(2);
    expect(persisted.slides![0]!.src).toBe("carousel-x/a.atelier");
    expect(persisted.slides![1]!.src).toBe("carousel-x/b.atelier");
  });

  it("counts dangling RefVisual layers but does NOT remove them", () => {
    const docAbs = join(projectDir, "target.atelier");
    writeAtelier(docAbs, imageDoc("target"));

    const consumerDir = join(workspaceDir, "consumer");
    const consumerManifest = join(consumerDir, "project.atelier");
    const consumerDoc: AtelierDocument = {
      version: "1.0",
      name: "consumer",
      kind: "video",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [
        {
          id: "ref-layer-1",
          visual: { type: "ref", src: relative(workspaceDir, docAbs) },
          frame: { x: 0, y: 0 },
          bounds: { width: 1080, height: 1920 },
        },
      ],
      states: { default: { duration: 1, deltas: [] } },
    };
    writeAtelier(consumerManifest, consumerDoc);

    const report = deleteDoc({
      workspaceDir,
      projectName: "my-project",
      docPath: "target.atelier",
    });

    expect(report.refLayersDangling).toEqual([
      { project: "consumer", docPath: "project.atelier", layerId: "ref-layer-1" },
    ]);
    // Layer NOT removed.
    const persisted = readAtelier(consumerManifest);
    expect(persisted.layers).toHaveLength(1);
    expect(persisted.layers[0]!.id).toBe("ref-layer-1");
  });

  it("can delete project.atelier just like any other doc", () => {
    // Post-pivot: project.atelier is not privileged.
    writeAtelier(join(projectDir, "project.atelier"), carouselDoc("host"));
    const report = deleteDoc({
      workspaceDir,
      projectName: "my-project",
      docPath: "project.atelier",
    });
    expect(report.docPath).toBe("project.atelier");
    expect(existsSync(join(projectDir, "project.atelier"))).toBe(false);
  });

  it("throws when the doc is not found", () => {
    expect(() =>
      deleteDoc({
        workspaceDir,
        projectName: "my-project",
        docPath: "ghost.atelier",
      }),
    ).toThrow(/doc not found/);
  });

  it("returns empty arrays for an isolated workspace", () => {
    writeAtelier(join(projectDir, "lonely.atelier"), imageDoc("lonely"));
    const report = deleteDoc({
      workspaceDir,
      projectName: "my-project",
      docPath: "lonely.atelier",
    });
    expect(report.slideRefsRemoved).toEqual([]);
    expect(report.refLayersDangling).toEqual([]);
  });

  it("cascade walks every .atelier in the workspace (not just project.atelier)", () => {
    // The carousel host that references the target is named `other.atelier`,
    // NOT `project.atelier`. Pre-pivot the walk would have missed it.
    const targetAbs = join(projectDir, "target.atelier");
    writeAtelier(targetAbs, imageDoc("target"));

    const hostProjectDir = join(workspaceDir, "host-project");
    const hostDocAbs = join(hostProjectDir, "other.atelier");
    writeAtelier(
      hostDocAbs,
      carouselDoc("host", [
        relative(workspaceDir, targetAbs),
      ]),
    );

    const report = deleteDoc({
      workspaceDir,
      projectName: "my-project",
      docPath: "target.atelier",
    });

    expect(report.slideRefsRemoved).toEqual([
      { project: "host-project", slideIndex: 0 },
    ]);
    const persisted = readAtelier(hostDocAbs);
    expect(persisted.slides).toEqual([]);
  });

  it("reports refLayersDangling.docPath as the actual host doc path (not always project.atelier)", () => {
    const targetAbs = join(projectDir, "target.atelier");
    writeAtelier(targetAbs, imageDoc("target"));

    // The consumer carousel lives under slides/consumer.atelier inside a
    // sibling project — its docPath must be "slides/consumer.atelier".
    const consumerDir = join(workspaceDir, "consumer-project");
    const consumerDocAbs = join(consumerDir, "slides", "consumer.atelier");
    const consumerDoc: AtelierDocument = {
      version: "1.0",
      name: "consumer",
      kind: "video",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [
        {
          id: "ref-layer-x",
          visual: { type: "ref", src: relative(workspaceDir, targetAbs) },
          frame: { x: 0, y: 0 },
          bounds: { width: 1080, height: 1920 },
        },
      ],
      states: { default: { duration: 1, deltas: [] } },
    };
    writeAtelier(consumerDocAbs, consumerDoc);

    const report = deleteDoc({
      workspaceDir,
      projectName: "my-project",
      docPath: "target.atelier",
    });

    expect(report.refLayersDangling).toEqual([
      {
        project: "consumer-project",
        docPath: "slides/consumer.atelier",
        layerId: "ref-layer-x",
      },
    ]);
  });
});

// ─── listDocs ───────────────────────────────────────────────────────

describe("listDocs", () => {
  it("returns just the manifest when the project has only project.atelier", () => {
    writeAtelier(join(projectDir, "project.atelier"), videoDoc("solo"));
    const out = listDocs(projectDir);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      path: "project.atelier",
      kind: "video",
    });
  });

  it("returns DocListEntry shape {path, kind?} — no role / slideIndex / slideLabel", () => {
    writeAtelier(join(projectDir, "project.atelier"), videoDoc("host"));
    writeAtelier(join(projectDir, "scene.atelier"), imageDoc("scene"));
    const out = listDocs(projectDir);
    for (const entry of out) {
      const keys = Object.keys(entry).sort();
      // Allowed keys: "kind" + "path". No "role", "slideIndex", "slideLabel".
      expect(keys).not.toContain("role");
      expect(keys).not.toContain("slideIndex");
      expect(keys).not.toContain("slideLabel");
      expect(keys).toContain("path");
      // kind is optional but in this seed every doc has one.
      expect(entry.kind).toBeDefined();
    }
  });

  it("returns a flat alphabetical list of project root + slides/ docs", () => {
    // alpha.atelier < project.atelier < slides/beta.atelier lexicographically.
    writeAtelier(join(projectDir, "project.atelier"), carouselDoc("host"));
    writeAtelier(join(projectDir, "alpha.atelier"), imageDoc("alpha"));
    writeAtelier(join(projectDir, "slides", "beta.atelier"), imageDoc("beta"));

    const out = listDocs(projectDir);
    expect(out.map((e) => e.path)).toEqual([
      "alpha.atelier",
      "project.atelier",
      "slides/beta.atelier",
    ]);
  });

  it("omits kind when a doc fails to parse", () => {
    writeFileSync(join(projectDir, "broken.atelier"), "{not valid json");
    const out = listDocs(projectDir);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ path: "broken.atelier" });
  });

  it("filters out the `.atelier/` directory at project root (bug fix)", () => {
    // The hidden paradigm-style dir matches "*.atelier" but is NOT a doc.
    // Pre-fix, listDocs surfaced it; post-fix, statSync().isFile() filters
    // it out AND the defensive basename `.atelier` skip catches the case
    // where a future symlink follows into a dir.
    mkdirSync(join(projectDir, ".atelier"));
    // Add a file INSIDE the .atelier/ dir to make it non-empty (still a dir).
    writeFileSync(join(projectDir, ".atelier", "marker"), "");

    writeAtelier(join(projectDir, "project.atelier"), videoDoc("host"));
    writeAtelier(join(projectDir, "other.atelier"), imageDoc("other"));

    const out = listDocs(projectDir);
    const paths = out.map((e) => e.path);
    expect(paths).toEqual(["other.atelier", "project.atelier"]);
    // Defensive: no entry should be named ".atelier" exactly.
    expect(paths).not.toContain(".atelier");
  });

  it("surfaces slides/ docs even when no carousel host references them", () => {
    // Post-pivot listDocs walks the filesystem, not the manifest's slides[].
    writeAtelier(join(projectDir, "project.atelier"), videoDoc("host"));
    writeAtelier(join(projectDir, "slides", "orphan.atelier"), imageDoc("orphan"));

    const out = listDocs(projectDir);
    expect(out.map((e) => e.path)).toEqual([
      "project.atelier",
      "slides/orphan.atelier",
    ]);
  });
});
