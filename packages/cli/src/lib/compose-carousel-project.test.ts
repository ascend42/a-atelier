// Tests for #compose-carousel-project — kind:"carousel" slide manifest builder.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import type { AtelierDocument } from "@a-company/atelier-types";

import { composeCarouselProject } from "./compose-carousel-project.js";

let workspaceDir: string;
let projectDir: string;

function writeAtelier(absPath: string, doc: AtelierDocument): void {
  mkdirSync(absPath.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(absPath, JSON.stringify(doc, null, 2));
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

function readProject(): AtelierDocument {
  return JSON.parse(
    readFileSync(join(projectDir, "project.atelier"), "utf-8"),
  ) as AtelierDocument;
}

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "atelier-carousel-test-"));
  projectDir = join(workspaceDir, "my-carousel");
  mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

describe("composeCarouselProject", () => {
  it("scaffolds a fresh kind:'carousel' doc with the first slide", async () => {
    const slidePath = join(workspaceDir, "slide-a", "project.atelier");
    writeAtelier(slidePath, imageDoc("A"));

    const result = await composeCarouselProject({
      projectDir,
      docPath: "project.atelier",
      slidePath,
    });

    expect(result.addedSlide).toBe(true);
    expect(result.slideIndex).toBe(0);

    const persisted = readProject();
    expect(persisted.kind).toBe("carousel");
    expect(persisted.slides).toHaveLength(1);
    expect(persisted.slides![0]!.src).toBe(
      relative(workspaceDir, slidePath),
    );
  });

  it("appends a second slide", async () => {
    const slideA = join(workspaceDir, "slide-a", "project.atelier");
    const slideB = join(workspaceDir, "slide-b", "project.atelier");
    writeAtelier(slideA, imageDoc("A"));
    writeAtelier(slideB, imageDoc("B"));

    const r1 = await composeCarouselProject({ projectDir, docPath: "project.atelier", slidePath: slideA });
    expect(r1.slideIndex).toBe(0);

    const r2 = await composeCarouselProject({ projectDir, docPath: "project.atelier", slidePath: slideB });
    expect(r2.addedSlide).toBe(true);
    expect(r2.slideIndex).toBe(1);

    const persisted = readProject();
    expect(persisted.slides).toHaveLength(2);
    expect(persisted.slides![0]!.src).toBe(relative(workspaceDir, slideA));
    expect(persisted.slides![1]!.src).toBe(relative(workspaceDir, slideB));
  });

  it("throws on a direct self-ref carousel cycle", async () => {
    // Pre-seed the carousel with itself as a slide via a manual write,
    // then attempt to add it as a slide — direct self-ref.
    const carouselPath = join(projectDir, "project.atelier");
    writeAtelier(carouselPath, carouselDoc("self"));

    await expect(
      composeCarouselProject({
        projectDir,
        docPath: "project.atelier",
        slidePath: carouselPath,
      }),
    ).rejects.toThrow(/carousel cycle detected/);
  });

  it("throws on a 3-hop transitive cycle A → B → C → A", async () => {
    // C is the carousel under composition; we set up A → B → C → A and try
    // to add B as a slide to A. (Use A as the project under build.)
    const aDir = join(workspaceDir, "carousel-a");
    const bDir = join(workspaceDir, "carousel-b");
    const cDir = join(workspaceDir, "carousel-c");
    mkdirSync(aDir, { recursive: true });
    mkdirSync(bDir, { recursive: true });
    mkdirSync(cDir, { recursive: true });
    const aPath = join(aDir, "project.atelier");
    const bPath = join(bDir, "project.atelier");
    const cPath = join(cDir, "project.atelier");
    // Set up the cycle: A's slides include B already, B refs C, C refs A.
    writeAtelier(
      aPath,
      carouselDoc("A", [relative(workspaceDir, bPath)]),
    );
    writeAtelier(
      bPath,
      carouselDoc("B", [relative(workspaceDir, cPath)]),
    );
    writeAtelier(
      cPath,
      carouselDoc("C", [relative(workspaceDir, aPath)]),
    );

    // Add B as a slide to A — detector walks B → C → A and finds the cycle.
    await expect(
      composeCarouselProject({
        projectDir: aDir,
        docPath: "project.atelier",
        slidePath: bPath,
        workspaceRoot: workspaceDir,
      }),
    ).rejects.toThrow(/carousel cycle detected/);
  });

  it("duplicate slide path returns addedSlide:false with the existing index", async () => {
    const slide = join(workspaceDir, "slide-a", "project.atelier");
    writeAtelier(slide, imageDoc("A"));

    const r1 = await composeCarouselProject({ projectDir, docPath: "project.atelier", slidePath: slide });
    expect(r1.addedSlide).toBe(true);
    expect(r1.slideIndex).toBe(0);

    const r2 = await composeCarouselProject({ projectDir, docPath: "project.atelier", slidePath: slide });
    expect(r2.addedSlide).toBe(false);
    expect(r2.slideIndex).toBe(0);

    const persisted = readProject();
    expect(persisted.slides).toHaveLength(1);
  });

  it("insertAt: 0 inserts at the front", async () => {
    const slideA = join(workspaceDir, "slide-a", "project.atelier");
    const slideB = join(workspaceDir, "slide-b", "project.atelier");
    writeAtelier(slideA, imageDoc("A"));
    writeAtelier(slideB, imageDoc("B"));

    await composeCarouselProject({ projectDir, docPath: "project.atelier", slidePath: slideA });
    const r = await composeCarouselProject({
      projectDir,
      docPath: "project.atelier",
      slidePath: slideB,
      insertAt: 0,
    });

    expect(r.addedSlide).toBe(true);
    expect(r.slideIndex).toBe(0);

    const persisted = readProject();
    expect(persisted.slides).toHaveLength(2);
    expect(persisted.slides![0]!.src).toBe(relative(workspaceDir, slideB));
    expect(persisted.slides![1]!.src).toBe(relative(workspaceDir, slideA));
  });

  it("refuses when project already exists with kind:'video'", async () => {
    const carouselPath = join(projectDir, "project.atelier");
    const videoDoc: AtelierDocument = {
      version: "1.0",
      name: "videoP",
      kind: "video",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 0, deltas: [] } },
    };
    writeAtelier(carouselPath, videoDoc);

    const slidePath = join(workspaceDir, "slide-a", "project.atelier");
    writeAtelier(slidePath, imageDoc("A"));

    await expect(
      composeCarouselProject({ projectDir, docPath: "project.atelier", slidePath }),
    ).rejects.toThrow(/project is not a carousel; cannot add slides/);
  });

  it("computes slide src as workspace-relative path", async () => {
    const slidePath = join(workspaceDir, "subdir", "deep", "slide.atelier");
    writeAtelier(slidePath, imageDoc("nested"));

    await composeCarouselProject({
      projectDir,
      docPath: "project.atelier",
      slidePath,
      workspaceRoot: workspaceDir,
    });

    const persisted = readProject();
    expect(persisted.slides![0]!.src).toBe(
      join("subdir", "deep", "slide.atelier"),
    );
  });

  it("threads transition / duration / label into the SlideRef", async () => {
    const slidePath = join(workspaceDir, "slide-a", "project.atelier");
    writeAtelier(slidePath, imageDoc("A"));

    await composeCarouselProject({
      projectDir,
      docPath: "project.atelier",
      slidePath,
      duration: 90,
      transition: { kind: "crossfade", durationFrames: 12 },
      label: "Hero shot",
    });

    const persisted = readProject();
    expect(persisted.slides![0]).toMatchObject({
      duration: 90,
      transition: { kind: "crossfade", durationFrames: 12 },
      label: "Hero shot",
    });
  });

  it("writes to a non-default docPath and does NOT touch project.atelier", async () => {
    // Caller specifies a slug-based doc path — the v1 ingest pivot.
    // The compose helper must write ONLY to <projectDir>/<docPath>, never
    // to project.atelier.
    const slidePath = join(workspaceDir, "slide-a", "project.atelier");
    writeAtelier(slidePath, imageDoc("A"));

    const result = await composeCarouselProject({
      projectDir,
      docPath: "gallery.atelier",
      slidePath,
      workspaceRoot: workspaceDir,
    });

    expect(result.addedSlide).toBe(true);
    expect(result.slideIndex).toBe(0);

    const carouselDocPath = join(projectDir, "gallery.atelier");
    expect(
      JSON.parse(readFileSync(carouselDocPath, "utf-8")) as AtelierDocument,
    ).toMatchObject({
      kind: "carousel",
      slides: [{ src: relative(workspaceDir, slidePath) }],
    });
    // Critical: the helper must NOT write project.atelier.
    expect(existsSync(join(projectDir, "project.atelier"))).toBe(false);
  });
});
