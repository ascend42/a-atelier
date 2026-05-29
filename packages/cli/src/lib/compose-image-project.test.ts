// Tests for #compose-image-project — single-image kind:"image" project ingest.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AtelierDocument } from "@a-company/atelier-types";

import { composeImageProject } from "./compose-image-project.js";

let workDir: string;
let projectDir: string;
let externalDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "atelier-compose-image-test-"));
  projectDir = join(workDir, "my-image-project");
  externalDir = join(workDir, "external");
  // Project dir is created on demand by the helper or the test.
  // External dir holds source files that live OUTSIDE the project tree.
  // We use mkdtempSync's dir then create subdirs.
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(externalDir, { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function readProject(): AtelierDocument {
  return JSON.parse(
    readFileSync(join(projectDir, "project.atelier"), "utf-8"),
  ) as AtelierDocument;
}

describe("composeImageProject", () => {
  it("scaffolds a fresh kind:'image' project with a single img layer + asset", async () => {
    const sourceFile = join(externalDir, "photo-1.jpg");
    writeFileSync(sourceFile, "fake jpg bytes");

    const result = await composeImageProject({
      projectDir,
      docPath: "project.atelier",
      sourceFile,
    });

    expect(result.addedImageLayer).toBe(true);
    expect(result.layerId).toBe("img-photo-1");
    expect(result.assetId).toBe("img-photo-1");

    const persisted = readProject();
    expect(persisted.kind).toBe("image");
    expect(persisted.layers).toHaveLength(1);

    const layer = persisted.layers[0]!;
    expect(layer.id).toBe("img-photo-1");
    expect(layer.tags).toEqual(["image"]);
    expect(layer.description).toBe("photo-1.jpg");
    expect(layer.visual).toMatchObject({
      type: "image",
      assetId: "img-photo-1",
      src: "media/photo-1.jpg",
    });
    expect(layer.frame).toEqual({ x: 0, y: 0 });
    // Bounds = canvas (default 1080×1920).
    expect(layer.bounds).toEqual({ width: 1080, height: 1920 });

    // states.default = { duration: 1, deltas: [] }
    expect(persisted.states.default).toEqual({ duration: 1, deltas: [] });

    // Asset entry registered.
    expect(persisted.assets?.["img-photo-1"]).toMatchObject({
      type: "image",
      src: "media/photo-1.jpg",
      description: "photo-1.jpg",
    });

    // File copied into media/.
    expect(existsSync(join(projectDir, "media", "photo-1.jpg"))).toBe(true);

    // No transcript.json written. No timeline block.
    expect(existsSync(join(projectDir, "transcript.json"))).toBe(false);
    expect(persisted.timeline).toBeUndefined();
  });

  it("is idempotent — re-ingesting the same image returns addedImageLayer:false", async () => {
    const sourceFile = join(externalDir, "photo-1.jpg");
    writeFileSync(sourceFile, "fake jpg bytes");

    const r1 = await composeImageProject({ projectDir, docPath: "project.atelier", sourceFile });
    expect(r1.addedImageLayer).toBe(true);

    const r2 = await composeImageProject({ projectDir, docPath: "project.atelier", sourceFile });
    expect(r2.addedImageLayer).toBe(false);
    expect(r2.layerId).toBe("img-photo-1");

    const persisted = readProject();
    // Still only one img layer.
    const imgLayers = persisted.layers.filter((l) => l.id.startsWith("img-"));
    expect(imgLayers).toHaveLength(1);
  });

  it("throws when adding a different image to an existing image project", async () => {
    const sourceA = join(externalDir, "photo-1.jpg");
    const sourceB = join(externalDir, "photo-2.jpg");
    writeFileSync(sourceA, "A");
    writeFileSync(sourceB, "B");

    await composeImageProject({ projectDir, docPath: "project.atelier", sourceFile: sourceA });

    await expect(
      composeImageProject({ projectDir, docPath: "project.atelier", sourceFile: sourceB }),
    ).rejects.toThrow(
      /image project already has an image; rename or delete the existing image before adding another/,
    );
  });

  it("applies canvas bounds to the layer (honors pre-existing canvas)", async () => {
    // Pre-seed a project.atelier with a custom canvas.
    const seedDoc: AtelierDocument = {
      version: "1.0",
      name: "custom",
      kind: "image",
      canvas: { width: 800, height: 600, fps: 30 },
      layers: [],
      states: { default: { duration: 1, deltas: [] } },
    };
    writeFileSync(
      join(projectDir, "project.atelier"),
      JSON.stringify(seedDoc, null, 2),
    );

    const sourceFile = join(externalDir, "hero.png");
    writeFileSync(sourceFile, "png bytes");

    await composeImageProject({ projectDir, docPath: "project.atelier", sourceFile });

    const persisted = readProject();
    expect(persisted.layers[0]!.bounds).toEqual({ width: 800, height: 600 });
  });

  it("does NOT write a transcript.json and does NOT add a timeline block", async () => {
    const sourceFile = join(externalDir, "photo-1.jpg");
    writeFileSync(sourceFile, "bytes");

    await composeImageProject({ projectDir, docPath: "project.atelier", sourceFile });

    expect(existsSync(join(projectDir, "transcript.json"))).toBe(false);
    expect(existsSync(join(projectDir, "transcripts"))).toBe(false);
    const persisted = readProject();
    expect(persisted.timeline).toBeUndefined();
  });

  it("copies source from outside the project tree into media/", async () => {
    // Source intentionally lives at a foreign workspace path.
    mkdirSync(join(externalDir, "deep"), { recursive: true });
    const externalImage = join(externalDir, "deep", "outside.jpg");
    writeFileSync(externalImage, "outside bytes");

    const result = await composeImageProject({
      projectDir,
      docPath: "project.atelier",
      sourceFile: externalImage,
    });
    expect(result.addedImageLayer).toBe(true);

    const copied = join(projectDir, "media", "outside.jpg");
    expect(existsSync(copied)).toBe(true);
    expect(readFileSync(copied, "utf-8")).toBe("outside bytes");
  });

  it("writes to a non-default docPath and does NOT touch project.atelier", async () => {
    // Caller specifies a slug-based doc path — the v1 ingest pivot.
    // The compose helper must write ONLY to <projectDir>/<docPath>, never
    // to project.atelier.
    const sourceFile = join(externalDir, "hero.jpg");
    writeFileSync(sourceFile, "bytes");

    const result = await composeImageProject({
      projectDir,
      docPath: "hero-image.atelier",
      sourceFile,
    });

    expect(result.addedImageLayer).toBe(true);
    expect(existsSync(join(projectDir, "hero-image.atelier"))).toBe(true);
    // Critical: the helper must NOT write project.atelier.
    expect(existsSync(join(projectDir, "project.atelier"))).toBe(false);

    const persisted = JSON.parse(
      readFileSync(join(projectDir, "hero-image.atelier"), "utf-8"),
    ) as AtelierDocument;
    expect(persisted.kind).toBe("image");
    expect(persisted.layers).toHaveLength(1);
    expect(persisted.layers[0]!.id).toBe("img-hero");
  });

  it("respects mediaBasename override", async () => {
    const sourceFile = join(externalDir, "weird name@@.jpg");
    writeFileSync(sourceFile, "bytes");

    const result = await composeImageProject({
      projectDir,
      docPath: "project.atelier",
      sourceFile,
      mediaBasename: "renamed.jpg",
    });

    expect(result.layerId).toBe("img-renamed");
    expect(existsSync(join(projectDir, "media", "renamed.jpg"))).toBe(true);
    const persisted = readProject();
    expect(persisted.layers[0]!.description).toBe("renamed.jpg");
    expect(
      (persisted.layers[0]!.visual as { src?: string }).src,
    ).toBe("media/renamed.jpg");
  });
});
