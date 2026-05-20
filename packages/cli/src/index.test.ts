import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { AtelierDocument } from "@a-company/atelier-types";
import { serializeAtelier, parseAtelier } from "@a-company/atelier-schema";
import { fileURLToPath } from "node:url";
import { validateFile } from "./commands/validate.js";
import { lintFile } from "./commands/lint.js";
import {
  createVideoProject,
  loadVideoProject,
  readCutList,
  writeCutList,
  readTranscript,
  writeTranscript,
  readComposition,
  writeComposition,
} from "./lib/video-project.js";
import { parseSilenceDetectStderr } from "./lib/silence-detect.js";
import {
  invertToSpeechIntervals,
  buildInitialCuts,
  resolveOverlaps,
  clampBoundaries,
  mergeWithExisting,
  applyGlobalPadding,
} from "./lib/cut-model.js";
import { parseWhisperCppJson } from "./lib/whisper.js";
import {
  flattenWords,
  groupIntoPhrases,
  mergeTranscriptWithExisting,
  applyTextEdit,
  applyBatchReplace,
  applyHide,
  applyAdd,
  applyMerge,
  applySplit,
} from "./lib/transcript-model.js";
import { buildCaptionLayers, rewriteCaptionLayers } from "./lib/caption-builder.js";
import {
  loadRecipe,
  resolveRecipePath,
  scaffoldRecipeYaml,
  applyRecipeToTrimOptions,
  applyRecipeToTranscribeOptions,
  applyRecipeToCaptionOptions,
  applyRecipeToOverlay,
  renderPageNumberFormat,
  renderRecipeWithDefaults,
  recipeToYaml,
  RECIPE_VERSION,
} from "./lib/recipe.js";
import type { VideoTranscript, StudioRecipe } from "@a-company/atelier-types";
import { getInfo } from "./commands/info.js";
import { resolveStill } from "./commands/still.js";
import { buildFfmpegArgs, checkFfmpeg } from "./commands/render-pipeline.js";
import { renderFrameSVG } from "@a-company/atelier-svg";
import { exportToLottie } from "@a-company/atelier-lottie";
import { Command } from "commander";
import { exportImageCommand, resolveExportDimensions } from "./commands/export-image.js";
import { recipeCommand } from "./commands/recipe.js";
import {
  carouselCommand,
  composeCarouselFrameDoc,
  expandInputs,
  carouselFileName,
} from "./commands/carousel.js";
import { fitImageToCanvas } from "./lib/render-image.js";

// ─── Test Fixtures ────────────────────────────────────────────

const VALID_DOC: AtelierDocument = {
  version: "1.0",
  name: "test-animation",
  description: "A test animation for CLI",
  canvas: { width: 1920, height: 1080, fps: 60, background: "#000000" },
  layers: [
    {
      id: "bg",
      visual: {
        type: "shape",
        shape: { type: "rect" },
        fill: { type: "solid", color: "#1a1a2e" },
      },
      frame: { x: 0, y: 0 },
      bounds: { width: 1920, height: 1080 },
    },
    {
      id: "title",
      description: "Main title text",
      visual: {
        type: "text",
        content: "Hello Atelier",
        style: {
          fontFamily: "Inter",
          fontSize: 72,
          fontWeight: "bold",
          textAlign: "center",
          color: "#FFFFFF",
        },
      },
      frame: { x: 960, y: 540 },
      bounds: { width: 800, height: 100 },
      anchorPoint: { x: 0.5, y: 0.5 },
      opacity: 0,
    },
  ],
  states: {
    intro: {
      description: "Title fades in",
      duration: 60,
      deltas: [
        {
          layer: "title",
          property: "opacity",
          range: [0, 30],
          from: 0,
          to: 1,
          easing: "ease-out",
        },
        {
          layer: "title",
          property: "scale.x",
          range: [0, 45],
          from: 0.8,
          to: 1,
        },
      ],
    },
    idle: {
      description: "Static hold",
      duration: 30,
      deltas: [],
    },
  },
};

const OVERLAP_DOC: AtelierDocument = {
  version: "1.0",
  name: "overlap-test",
  canvas: { width: 100, height: 100, fps: 30 },
  layers: [
    {
      id: "rect",
      visual: { type: "shape", shape: { type: "rect" } },
      frame: { x: 0, y: 0 },
      bounds: { width: 100, height: 100 },
    },
  ],
  states: {
    bad: {
      duration: 30,
      deltas: [
        {
          layer: "rect",
          property: "opacity",
          range: [0, 15],
          from: 0,
          to: 1,
        },
        {
          layer: "rect",
          property: "opacity",
          range: [10, 25],
          from: 0.5,
          to: 0,
        },
      ],
    },
  },
};

// ─── Temp Directory Setup ─────────────────────────────────────

let tmpDir: string;

beforeAll(() => {
  tmpDir = join(tmpdir(), `atelier-cli-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmpFile(name: string, content: string): string {
  const filePath = join(tmpDir, name);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ─── Validate Tests ───────────────────────────────────────────

describe("validateFile", () => {
  it("reports valid for a correct .atelier file", () => {
    const yaml = serializeAtelier(VALID_DOC);
    const filePath = writeTmpFile("valid.atelier", yaml);
    const result = validateFile(filePath);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports errors for invalid YAML content", () => {
    const filePath = writeTmpFile("invalid.atelier", "{{not yaml");
    const result = validateFile(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports errors for schema-invalid document", () => {
    const filePath = writeTmpFile(
      "bad-schema.atelier",
      "name: missing-everything\n",
    );
    const result = validateFile(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports errors for overlapping deltas", () => {
    const yaml = serializeAtelier(OVERLAP_DOC);
    const filePath = writeTmpFile("overlap.atelier", yaml);
    const result = validateFile(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Overlapping"))).toBe(true);
  });

  it("reports error for missing file", () => {
    const result = validateFile("/nonexistent/file.atelier");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Cannot read file");
  });
});

// ─── Info Tests ───────────────────────────────────────────────

describe("getInfo", () => {
  it("returns correct summary for a document", () => {
    const info = getInfo(VALID_DOC);
    expect(info.name).toBe("test-animation");
    expect(info.description).toBe("A test animation for CLI");
    expect(info.canvas.width).toBe(1920);
    expect(info.canvas.height).toBe(1080);
    expect(info.canvas.fps).toBe(60);
    expect(info.canvas.background).toBe("#000000");
    expect(info.layers.count).toBe(2);
    expect(info.layers.items[0]).toEqual({ id: "bg", type: "shape" });
    expect(info.layers.items[1]).toEqual({ id: "title", type: "text" });
    expect(info.states.count).toBe(2);
    expect(info.states.items).toContainEqual({
      name: "intro",
      duration: 60,
      deltaCount: 2,
    });
    expect(info.states.items).toContainEqual({
      name: "idle",
      duration: 30,
      deltaCount: 0,
    });
    expect(info.presets.count).toBe(0);
  });

  it("handles minimal document", () => {
    const minDoc: AtelierDocument = {
      version: "1.0",
      name: "minimal",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    const info = getInfo(minDoc);
    expect(info.name).toBe("minimal");
    expect(info.description).toBeUndefined();
    expect(info.layers.count).toBe(0);
    expect(info.states.count).toBe(0);
    expect(info.presets.count).toBe(0);
  });
});

// ─── Still Tests ──────────────────────────────────────────────

describe("resolveStill", () => {
  it("resolves frame 0 of a specified state", () => {
    const resolved = resolveStill(VALID_DOC, "intro", 0);
    expect(resolved.frame).toBe(0);
    expect(resolved.stateName).toBe("intro");
    expect(resolved.layers).toHaveLength(2);
    // title layer has opacity delta starting at 0
    const title = resolved.layers.find((l) => l.id === "title");
    expect(title).toBeDefined();
    expect(title!.computedProperties.opacity).toBe(0);
  });

  it("resolves midpoint frame with interpolation", () => {
    const resolved = resolveStill(VALID_DOC, "intro", 15);
    const title = resolved.layers.find((l) => l.id === "title");
    expect(title).toBeDefined();
    // opacity at frame 15 of range [0,30] -- eased, so not exactly 0.5 but > 0
    const opacity = title!.computedProperties.opacity as number;
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(1);
  });

  it("defaults to first state when state not provided", () => {
    const resolved = resolveStill(VALID_DOC, undefined, 0);
    // First state is "intro"
    expect(resolved.stateName).toBe("intro");
  });

  it("defaults to frame 0 when frame not provided", () => {
    const resolved = resolveStill(VALID_DOC, "intro");
    expect(resolved.frame).toBe(0);
  });

  it("throws for nonexistent state", () => {
    expect(() => resolveStill(VALID_DOC, "nonexistent", 0)).toThrow(
      "not found",
    );
  });

  it("throws for document with no states", () => {
    const noStates: AtelierDocument = {
      version: "1.0",
      name: "empty",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    expect(() => resolveStill(noStates)).toThrow("no states");
  });
});

// ─── Render Pipeline Tests ───────────────────────────────────

describe("buildFfmpegArgs", () => {
  it("builds correct MP4 args", () => {
    const args = buildFfmpegArgs(1920, 1080, 60, "mp4", "out.mp4");
    expect(args).toContain("-y");
    expect(args).toContain("-f");
    expect(args).toContain("rawvideo");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("bgra");
    expect(args).toContain("-s");
    expect(args).toContain("1920x1080");
    expect(args).toContain("-r");
    expect(args).toContain("60");
    expect(args).toContain("-i");
    expect(args).toContain("pipe:0");
    // MP4-specific
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("-crf");
    expect(args).toContain("18");
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("builds correct GIF args", () => {
    const args = buildFfmpegArgs(640, 480, 30, "gif", "out.gif");
    expect(args).toContain("rawvideo");
    expect(args).toContain("640x480");
    expect(args).toContain("30");
    // GIF-specific
    expect(args).toContain("-vf");
    expect(args).toContain("-loop");
    expect(args).toContain("0");
    expect(args[args.length - 1]).toBe("out.gif");
    // Should NOT contain MP4-specific flags
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("yuv420p");
  });

  it("uses string fps value", () => {
    const args = buildFfmpegArgs(100, 100, 24, "mp4", "x.mp4");
    expect(args).toContain("24");
  });
});

describe("checkFfmpeg", () => {
  it("returns a boolean", async () => {
    const result = await checkFfmpeg();
    expect(typeof result).toBe("boolean");
  });
});

// ─── Export SVG Tests ────────────────────────────────────────

describe("renderFrameSVG (export-svg)", () => {
  it("produces valid SVG output", () => {
    const svg = renderFrameSVG(VALID_DOC, "intro", 0);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("1920");
    expect(svg).toContain("1080");
  });

  it("defaults to frame 0", () => {
    const svg = renderFrameSVG(VALID_DOC, "intro");
    expect(svg).toContain("<svg");
  });

  it("supports XML declaration option", () => {
    const svg = renderFrameSVG(VALID_DOC, "intro", 0, { xmlDeclaration: true });
    expect(svg).toContain('<?xml version="1.0"');
  });
});

// ─── Export Lottie Tests ─────────────────────────────────────

describe("exportToLottie (export-lottie)", () => {
  it("produces valid Lottie JSON", () => {
    const { json, warnings } = exportToLottie(VALID_DOC, { state: "intro" });
    expect(json.v).toBeDefined();
    expect(json.layers).toBeDefined();
    expect(json.fr).toBe(60);
    expect(json.w).toBe(1920);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("defaults to first state", () => {
    const { json } = exportToLottie(VALID_DOC);
    expect(json.op).toBe(60); // intro duration
  });

  it("includes warnings for unsupported features", () => {
    // VALID_DOC uses ease-out easing which may produce warnings
    const { warnings } = exportToLottie(VALID_DOC);
    expect(Array.isArray(warnings)).toBe(true);
  });
});

// ─── Lint Tests ───────────────────────────────────────────────

describe("lintFile", () => {
  it("passes all gates for a valid document with no video layers", () => {
    const yaml = serializeAtelier(VALID_DOC);
    const filePath = writeTmpFile("lint-valid.atelier", yaml);
    const result = lintFile(filePath);
    expect(result.valid).toBe(true);
    expect(result.gates).toHaveLength(3);
    expect(result.gates.every((g) => g.pass)).toBe(true);
    expect(result.gates.map((g) => g.gate)).toEqual([
      "^valid-document",
      "^valid-delta",
      "^valid-video-layer",
    ]);
  });

  it("fails ^valid-document and skips remaining gates on schema-invalid input", () => {
    const filePath = writeTmpFile("lint-bad-schema.atelier", "name: broken\n");
    const result = lintFile(filePath);
    expect(result.valid).toBe(false);
    expect(result.gates).toHaveLength(1);
    expect(result.gates[0].gate).toBe("^valid-document");
    expect(result.gates[0].pass).toBe(false);
  });

  it("fails ^valid-delta for overlapping deltas", () => {
    const yaml = serializeAtelier(OVERLAP_DOC);
    const filePath = writeTmpFile("lint-overlap.atelier", yaml);
    const result = lintFile(filePath);
    expect(result.valid).toBe(false);
    const deltaGate = result.gates.find((g) => g.gate === "^valid-delta");
    expect(deltaGate?.pass).toBe(false);
    expect(deltaGate?.errors.some((e) => e.includes("Overlapping"))).toBe(true);
  });

  it("passes ^valid-video-layer for a valid video layer with videoMeta", () => {
    const videoDoc: AtelierDocument = {
      ...VALID_DOC,
      name: "video-test",
      layers: [
        {
          id: "clip",
          visual: { type: "video", assetId: "v1", sourceOffset: 0, sourceEnd: 5 },
          frame: { x: 0, y: 0 },
          bounds: { width: 1920, height: 1080 },
        },
      ],
      assets: {
        v1: {
          type: "video",
          src: "clip.mp4",
          videoMeta: { duration: 10, fps: 30, width: 1920, height: 1080 },
        },
      },
    };
    const yaml = serializeAtelier(videoDoc);
    const filePath = writeTmpFile("lint-video-valid.atelier", yaml);
    const result = lintFile(filePath);
    const videoGate = result.gates.find((g) => g.gate === "^valid-video-layer");
    expect(videoGate?.pass).toBe(true);
  });

  it("fails ^valid-video-layer when sourceEnd <= sourceOffset", () => {
    const videoDoc: AtelierDocument = {
      ...VALID_DOC,
      name: "video-bad",
      layers: [
        {
          id: "clip",
          visual: { type: "video", assetId: "v1", sourceOffset: 8, sourceEnd: 5 },
          frame: { x: 0, y: 0 },
          bounds: { width: 1920, height: 1080 },
        },
      ],
      assets: {
        v1: {
          type: "video",
          src: "clip.mp4",
          videoMeta: { duration: 10, fps: 30, width: 1920, height: 1080 },
        },
      },
    };
    const yaml = serializeAtelier(videoDoc);
    const filePath = writeTmpFile("lint-video-bad-range.atelier", yaml);
    const result = lintFile(filePath);
    expect(result.valid).toBe(false);
    const videoGate = result.gates.find((g) => g.gate === "^valid-video-layer");
    expect(videoGate?.pass).toBe(false);
    expect(videoGate?.errors.some((e) => e.includes("sourceEnd"))).toBe(true);
  });

  it("fails ^valid-video-layer when sourceEnd exceeds videoMeta.duration", () => {
    const videoDoc: AtelierDocument = {
      ...VALID_DOC,
      name: "video-exceed",
      layers: [
        {
          id: "clip",
          visual: { type: "video", assetId: "v1", sourceEnd: 15 },
          frame: { x: 0, y: 0 },
          bounds: { width: 1920, height: 1080 },
        },
      ],
      assets: {
        v1: {
          type: "video",
          src: "clip.mp4",
          videoMeta: { duration: 10, fps: 30, width: 1920, height: 1080 },
        },
      },
    };
    const yaml = serializeAtelier(videoDoc);
    const filePath = writeTmpFile("lint-video-exceed.atelier", yaml);
    const result = lintFile(filePath);
    expect(result.valid).toBe(false);
    const videoGate = result.gates.find((g) => g.gate === "^valid-video-layer");
    expect(videoGate?.pass).toBe(false);
    expect(videoGate?.errors.some((e) => e.includes("exceeds asset duration"))).toBe(true);
  });

  it("reports error for missing file", () => {
    const result = lintFile("/nonexistent/file.atelier");
    expect(result.valid).toBe(false);
    expect(result.gates[0].gate).toBe("^valid-document");
    expect(result.gates[0].errors[0]).toContain("Cannot read file");
  });
});

// ─── VideoProject Tests ───────────────────────────────────────

describe("VideoProject", () => {
  let fakeSrc: string;

  beforeAll(() => {
    // Write a tiny placeholder that can be "copied" as the source video
    fakeSrc = join(tmpDir, "sample.mp4");
    writeFileSync(fakeSrc, "FAKE_VIDEO_BYTES", "utf-8");
  });

  it("createVideoProject scaffolds folder structure", async () => {
    const projectDir = join(tmpDir, "vp-create");
    const project = await createVideoProject(fakeSrc, projectDir);

    expect(project.dir).toBe(projectDir);
    expect(project.manifest.version).toBe("1.0");
    expect(project.manifest.composition).toBe("project.atelier");
    expect(project.manifest.cuts).toBe("cuts.json");
    expect(project.manifest.transcript).toBe("transcript.json");
    expect(project.manifest.exportDir).toBe("export/");

    // source file is copied
    const { existsSync: exists } = await import("node:fs");
    expect(exists(project.sourcePath)).toBe(true);
    expect(exists(project.compositionPath)).toBe(true);
    expect(exists(project.cutsPath)).toBe(true);
    expect(exists(project.exportDir)).toBe(true);
  });

  it("createVideoProject is idempotent — second call does not overwrite", async () => {
    const projectDir = join(tmpDir, "vp-idem");
    const p1 = await createVideoProject(fakeSrc, projectDir);

    // Write a custom composition to verify it isn't overwritten
    writeComposition(p1, { ...readComposition(p1), name: "custom-name" });
    const p2 = await createVideoProject(fakeSrc, projectDir);
    const doc = readComposition(p2);
    expect(doc.name).toBe("custom-name");
  });

  it("readComposition returns draft AtelierDocument", async () => {
    const projectDir = join(tmpDir, "vp-read-comp");
    const project = await createVideoProject(fakeSrc, projectDir);
    const doc = readComposition(project);
    expect(doc.version).toBe("1.0");
    expect(doc.name).toBe("sample");
    expect(doc.layers[0].visual.type).toBe("video");
  });

  it("writeComposition and readComposition roundtrip", async () => {
    const projectDir = join(tmpDir, "vp-comp-rt");
    const project = await createVideoProject(fakeSrc, projectDir);
    const doc = readComposition(project);
    doc.name = "roundtrip-test";
    writeComposition(project, doc);
    expect(readComposition(project).name).toBe("roundtrip-test");
  });

  it("readCutList returns empty cuts for fresh project", async () => {
    const projectDir = join(tmpDir, "vp-cuts-empty");
    const project = await createVideoProject(fakeSrc, projectDir);
    const cuts = readCutList(project);
    expect(cuts.cuts).toHaveLength(0);
    expect(cuts.source).toBe("source.mp4");
  });

  it("writeCutList and readCutList roundtrip (parametric 1.1)", async () => {
    const projectDir = join(tmpDir, "vp-cuts-rt");
    const project = await createVideoProject(fakeSrc, projectDir);
    writeCutList(project, {
      version: "1.1",
      source: "source.mp4",
      cuts: [
        { rawStart: 0, rawEnd: 5.5, paddingPre: 0.08, paddingPost: 0.12, label: "take 1" },
        { rawStart: 10, rawEnd: 20, paddingPre: 0.05, paddingPost: 0.05 },
      ],
    });
    const cuts = readCutList(project);
    expect(cuts.version).toBe("1.1");
    expect(cuts.cuts).toHaveLength(2);
    expect(cuts.cuts[0].label).toBe("take 1");
    expect(cuts.cuts[0].paddingPre).toBe(0.08);
    expect(cuts.cuts[1].rawEnd).toBe(20);
  });

  it("readCutList migrates legacy 1.0 cuts (flat start/end) to 1.1", async () => {
    const projectDir = join(tmpDir, "vp-cuts-migrate");
    const project = await createVideoProject(fakeSrc, projectDir);
    // Hand-write a 1.0 cuts.json (no version field, flat start/end)
    const { writeFileSync: wfs } = await import("node:fs");
    wfs(
      project.cutsPath,
      JSON.stringify({
        source: "source.mp4",
        cuts: [
          { start: 1.2, end: 4.8, label: "legacy" },
          { start: 7.0, end: 12.5 },
        ],
      }),
      "utf-8",
    );
    const cuts = readCutList(project);
    expect(cuts.version).toBe("1.1");
    expect(cuts.cuts[0].rawStart).toBe(1.2);
    expect(cuts.cuts[0].rawEnd).toBe(4.8);
    expect(cuts.cuts[0].paddingPre).toBe(0);
    expect(cuts.cuts[0].paddingPost).toBe(0);
    expect(cuts.cuts[0].label).toBe("legacy");
    expect(cuts.cuts[1].rawStart).toBe(7.0);
  });

  it("effectiveSpan clamps to [0, duration] and applies padding", async () => {
    const { effectiveSpan } = await import("./lib/video-project.js");
    expect(effectiveSpan(
      { rawStart: 1.0, rawEnd: 4.0, paddingPre: 0.5, paddingPost: 0.5 },
      10,
    )).toEqual({ start: 0.5, end: 4.5 });
    // padding past 0 clamps
    expect(effectiveSpan(
      { rawStart: 0.1, rawEnd: 2.0, paddingPre: 0.5, paddingPost: 0.5 },
      10,
    )).toEqual({ start: 0, end: 2.5 });
    // padding past duration clamps
    expect(effectiveSpan(
      { rawStart: 8.0, rawEnd: 9.9, paddingPre: 0.1, paddingPost: 0.5 },
      10,
    )).toEqual({ start: 7.9, end: 10 });
  });

  it("rewriteCutLayers preserves non-silence-trim layers", async () => {
    const { rewriteCutLayers, readComposition, writeComposition } = await import(
      "./lib/video-project.js"
    );
    const projectDir = join(tmpDir, "vp-rewrite");
    const project = await createVideoProject(fakeSrc, projectDir);
    const doc = readComposition(project);
    // Add a user overlay layer (not tagged silence-trim)
    doc.layers.push({
      id: "user-overlay",
      tags: ["overlay"],
      visual: { type: "text", content: "hello", style: { fontFamily: "Inter", fontSize: 60, color: "#FFF" } },
      frame: { x: 100, y: 100 },
      bounds: { width: 400, height: 80 },
    });
    writeComposition(project, doc);

    const updated = rewriteCutLayers(
      readComposition(project),
      [
        { rawStart: 0, rawEnd: 2, paddingPre: 0, paddingPost: 0 },
        { rawStart: 3, rawEnd: 5, paddingPre: 0, paddingPost: 0 },
      ],
      "source.mp4",
      10,
    );

    // User overlay survived
    expect(updated.layers.find((l) => l.id === "user-overlay")).toBeDefined();
    // Two silence-trim layers added
    const trimLayers = updated.layers.filter((l) => (l.tags ?? []).includes("silence-trim"));
    expect(trimLayers).toHaveLength(2);
    expect(trimLayers[0].id).toBe("clip-trim-0");
    expect(trimLayers[1].id).toBe("clip-trim-1");
  });

  it("rewriteCutLayers replaces existing silence-trim layers, not appends", async () => {
    const { rewriteCutLayers, readComposition } = await import("./lib/video-project.js");
    const projectDir = join(tmpDir, "vp-rewrite-replace");
    const project = await createVideoProject(fakeSrc, projectDir);

    const doc1 = rewriteCutLayers(
      readComposition(project),
      [{ rawStart: 0, rawEnd: 2, paddingPre: 0, paddingPost: 0 }],
      "source.mp4",
      10,
    );
    expect(doc1.layers.filter((l) => (l.tags ?? []).includes("silence-trim"))).toHaveLength(1);

    const doc2 = rewriteCutLayers(
      doc1,
      [
        { rawStart: 0, rawEnd: 2, paddingPre: 0, paddingPost: 0 },
        { rawStart: 3, rawEnd: 5, paddingPre: 0, paddingPost: 0 },
        { rawStart: 6, rawEnd: 8, paddingPre: 0, paddingPost: 0 },
      ],
      "source.mp4",
      10,
    );
    expect(doc2.layers.filter((l) => (l.tags ?? []).includes("silence-trim"))).toHaveLength(3);
  });

  it("readTranscript returns null before transcription runs", async () => {
    const projectDir = join(tmpDir, "vp-transcript-null");
    const project = await createVideoProject(fakeSrc, projectDir);
    expect(readTranscript(project)).toBeNull();
  });

  it("writeTranscript and readTranscript roundtrip (editable 1.1)", async () => {
    const projectDir = join(tmpDir, "vp-transcript-rt");
    const project = await createVideoProject(fakeSrc, projectDir);
    writeTranscript(project, {
      version: "1.1",
      language: "en",
      segments: [
        {
          text: "Hello world",
          start: 0,
          end: 2.3,
          words: [
            { detected: "Hello", text: "Hello", start: 0, end: 0.8, confidence: 0.99 },
            { detected: "world", text: "world", start: 1.0, end: 2.3 },
          ],
        },
      ],
    });
    const t = readTranscript(project);
    expect(t).not.toBeNull();
    expect(t!.version).toBe("1.1");
    expect(t!.language).toBe("en");
    expect(t!.segments[0].words).toHaveLength(2);
    expect(t!.segments[0].words[0].confidence).toBe(0.99);
    expect(t!.segments[0].words[0].detected).toBe("Hello");
    expect(t!.segments[0].words[0].text).toBe("Hello");
  });

  it("readTranscript preserves user-edited flags through roundtrip", async () => {
    const projectDir = join(tmpDir, "vp-transcript-edits");
    const project = await createVideoProject(fakeSrc, projectDir);
    writeTranscript(project, {
      version: "1.1",
      segments: [
        {
          text: "I went to the store",
          start: 0,
          end: 3,
          words: [
            { detected: "I", text: "I", start: 0, end: 0.2 },
            { detected: "went", text: "went", start: 0.3, end: 0.6 },
            { detected: "to", text: "to", start: 0.7, end: 0.85 },
            { detected: "the", text: "the", start: 0.9, end: 1.05 },
            { detected: "door", text: "store", start: 1.1, end: 1.5, userEdited: true, confidence: 0.62 },
          ],
        },
      ],
    });
    const t = readTranscript(project)!;
    const lastWord = t.segments[0].words[4];
    expect(lastWord.detected).toBe("door");
    expect(lastWord.text).toBe("store");
    expect(lastWord.userEdited).toBe(true);
  });

  it("readTranscript migrates legacy 1.0 transcript (flat word: string) to 1.1", async () => {
    const projectDir = join(tmpDir, "vp-transcript-migrate");
    const project = await createVideoProject(fakeSrc, projectDir);
    const { writeFileSync: wfs } = await import("node:fs");
    wfs(
      project.transcriptPath,
      JSON.stringify({
        language: "en",
        segments: [
          {
            text: "Hello world",
            start: 0,
            end: 2.3,
            words: [
              { word: "Hello", start: 0, end: 0.8, confidence: 0.99 },
              { word: "world", start: 1.0, end: 2.3 },
            ],
          },
        ],
      }),
      "utf-8",
    );
    const t = readTranscript(project)!;
    expect(t.version).toBe("1.1");
    expect(t.segments[0].words[0].detected).toBe("Hello");
    expect(t.segments[0].words[0].text).toBe("Hello");
    expect(t.segments[0].words[0].confidence).toBe(0.99);
    expect(t.segments[0].words[0].userEdited).toBeUndefined();
    expect(t.segments[0].words[1].detected).toBe("world");
  });

  it("loadVideoProject resolves paths for existing folder", async () => {
    const projectDir = join(tmpDir, "vp-load");
    await createVideoProject(fakeSrc, projectDir);
    const loaded = loadVideoProject(projectDir);
    expect(loaded.dir).toBe(projectDir);
    expect(loaded.sourcePath).toContain("source.mp4");
    expect(loaded.compositionPath).toContain("project.atelier");
    expect(loaded.cutsPath).toContain("cuts.json");
    expect(loaded.exportDir).toContain("export");
  });
});

// ─── silence-detect parser ────────────────────────────────────

describe("parseSilenceDetectStderr", () => {
  it("parses paired silence_start / silence_end lines", () => {
    const stderr = [
      "[silencedetect @ 0x7fc] silence_start: 1.234",
      "[silencedetect @ 0x7fc] silence_end: 5.678 | silence_duration: 4.444",
      "[silencedetect @ 0x7fc] silence_start: 12.0",
      "[silencedetect @ 0x7fc] silence_end: 14.5 | silence_duration: 2.5",
    ].join("\n");
    const intervals = parseSilenceDetectStderr(stderr);
    expect(intervals).toEqual([
      { start: 1.234, end: 5.678 },
      { start: 12.0, end: 14.5 },
    ]);
  });

  it("tolerates interleaved ffmpeg chatter", () => {
    const stderr = [
      "ffmpeg version 6.0",
      "Stream #0:0: Audio: aac, 48000 Hz",
      "[silencedetect @ 0x] silence_start: 0.5",
      "Press [q] to stop",
      "[silencedetect @ 0x] silence_end: 1.0 | silence_duration: 0.5",
    ].join("\n");
    expect(parseSilenceDetectStderr(stderr)).toEqual([{ start: 0.5, end: 1.0 }]);
  });

  it("clamps negative silence_start to 0", () => {
    const stderr = [
      "[silencedetect @ 0x] silence_start: -0.123",
      "[silencedetect @ 0x] silence_end: 2.0 | silence_duration: 2.123",
    ].join("\n");
    expect(parseSilenceDetectStderr(stderr)).toEqual([{ start: 0, end: 2.0 }]);
  });

  it("returns empty for stderr with no silence lines", () => {
    expect(parseSilenceDetectStderr("ffmpeg version 6.0\nno silence here")).toEqual([]);
  });

  it("drops unpaired silence_start with no following end", () => {
    const stderr = "[silencedetect @ 0x] silence_start: 5.0";
    expect(parseSilenceDetectStderr(stderr)).toEqual([]);
  });
});

// ─── cut-model ────────────────────────────────────────────────

describe("invertToSpeechIntervals", () => {
  it("inverts silences to speech with leading and trailing silence absent", () => {
    expect(
      invertToSpeechIntervals(
        [{ start: 2, end: 3 }, { start: 5, end: 6 }],
        10,
      ),
    ).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 10 },
    ]);
  });

  it("drops leading speech when source starts in silence", () => {
    expect(
      invertToSpeechIntervals([{ start: 0, end: 1 }, { start: 4, end: 5 }], 10),
    ).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 10 },
    ]);
  });

  it("drops trailing speech when source ends in silence", () => {
    expect(
      invertToSpeechIntervals([{ start: 2, end: 3 }, { start: 8, end: 10 }], 10),
    ).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 8 },
    ]);
  });

  it("returns whole duration as one speech interval when no silence detected", () => {
    expect(invertToSpeechIntervals([], 7.5)).toEqual([{ start: 0, end: 7.5 }]);
  });

  it("returns empty array for zero-duration source", () => {
    expect(invertToSpeechIntervals([], 0)).toEqual([]);
  });
});

describe("buildInitialCuts", () => {
  it("applies default padding to each speech interval", () => {
    const cuts = buildInitialCuts([
      { start: 1, end: 4 },
      { start: 6, end: 9 },
    ]);
    expect(cuts).toHaveLength(2);
    expect(cuts[0]).toMatchObject({ rawStart: 1, rawEnd: 4, paddingPre: 0.08, paddingPost: 0.12 });
    expect(cuts[1]).toMatchObject({ rawStart: 6, rawEnd: 9, paddingPre: 0.08, paddingPost: 0.12 });
  });

  it("accepts custom padding overrides", () => {
    const cuts = buildInitialCuts([{ start: 0, end: 2 }], 0.2, 0.3);
    expect(cuts[0].paddingPre).toBe(0.2);
    expect(cuts[0].paddingPost).toBe(0.3);
  });
});

describe("resolveOverlaps", () => {
  it("splits overlapping padding at silence midpoint", () => {
    const cuts = [
      { rawStart: 1, rawEnd: 3, paddingPre: 0.5, paddingPost: 0.5 },
      { rawStart: 3.4, rawEnd: 6, paddingPre: 0.5, paddingPost: 0.5 },
    ];
    // Gap is [3, 3.4], silence midpoint = 3.2
    // a.paddingPost should clamp to 0.2, b.paddingPre should clamp to 0.2
    resolveOverlaps(cuts);
    expect(cuts[0].paddingPost).toBeCloseTo(0.2);
    expect(cuts[1].paddingPre).toBeCloseTo(0.2);
  });

  it("leaves non-overlapping cuts untouched", () => {
    const cuts = [
      { rawStart: 1, rawEnd: 3, paddingPre: 0.1, paddingPost: 0.1 },
      { rawStart: 5, rawEnd: 7, paddingPre: 0.1, paddingPost: 0.1 },
    ];
    resolveOverlaps(cuts);
    expect(cuts[0].paddingPost).toBe(0.1);
    expect(cuts[1].paddingPre).toBe(0.1);
  });
});

describe("clampBoundaries", () => {
  it("clamps first cut's paddingPre so start >= 0", () => {
    const cuts = [{ rawStart: 0.05, rawEnd: 2, paddingPre: 0.5, paddingPost: 0.1 }];
    clampBoundaries(cuts, 10);
    expect(cuts[0].paddingPre).toBe(0.05);
  });

  it("clamps last cut's paddingPost so end <= duration", () => {
    const cuts = [{ rawStart: 8, rawEnd: 9.9, paddingPre: 0.1, paddingPost: 0.5 }];
    clampBoundaries(cuts, 10);
    expect(cuts[0].paddingPost).toBeCloseTo(0.1);
  });

  it("no-op on empty array", () => {
    const cuts: never[] = [];
    expect(() => clampBoundaries(cuts, 10)).not.toThrow();
  });
});

describe("mergeWithExisting", () => {
  it("preserves user padding on cuts whose raw boundary matches within tolerance", () => {
    const existing = [
      { rawStart: 1.0, rawEnd: 4.0, paddingPre: 0.3, paddingPost: 0.4, label: "intro" },
      { rawStart: 6.0, rawEnd: 9.0, paddingPre: 0.5, paddingPost: 0.5 },
    ];
    const fresh = [
      { rawStart: 1.2, rawEnd: 4.1, paddingPre: 0.08, paddingPost: 0.12 }, // matches existing[0]
      { rawStart: 6.0, rawEnd: 9.0, paddingPre: 0.08, paddingPost: 0.12 }, // matches existing[1]
    ];
    const merged = mergeWithExisting(fresh, existing);
    expect(merged[0].paddingPre).toBe(0.3);
    expect(merged[0].paddingPost).toBe(0.4);
    expect(merged[0].label).toBe("intro");
    expect(merged[0].rawStart).toBe(1.2); // raw updated to fresh
    expect(merged[1].paddingPre).toBe(0.5);
  });

  it("uses fresh defaults when no existing cut matches", () => {
    const merged = mergeWithExisting(
      [{ rawStart: 10, rawEnd: 12, paddingPre: 0.08, paddingPost: 0.12 }],
      [{ rawStart: 1, rawEnd: 4, paddingPre: 0.3, paddingPost: 0.4 }],
    );
    expect(merged[0].paddingPre).toBe(0.08);
  });

  it("respects custom tolerance", () => {
    const existing = [{ rawStart: 1.0, rawEnd: 4.0, paddingPre: 0.3, paddingPost: 0.4 }];
    const fresh = [{ rawStart: 2.0, rawEnd: 5.0, paddingPre: 0.08, paddingPost: 0.12 }];
    // With tolerance 0.5: doesn't match (1.0 vs 2.0 diff = 1.0)
    expect(mergeWithExisting(fresh, existing, 0.5)[0].paddingPre).toBe(0.08);
    // With tolerance 1.5: matches
    expect(mergeWithExisting(fresh, existing, 1.5)[0].paddingPre).toBe(0.3);
  });
});

describe("applyGlobalPadding", () => {
  it("tightens all cuts equally; floors at 0", () => {
    const cuts = [
      { rawStart: 1, rawEnd: 2, paddingPre: 0.1, paddingPost: 0.2 },
      { rawStart: 3, rawEnd: 4, paddingPre: 0.05, paddingPost: 0.05 },
    ];
    applyGlobalPadding(cuts, -0.08);
    expect(cuts[0].paddingPre).toBeCloseTo(0.02);
    expect(cuts[0].paddingPost).toBeCloseTo(0.12);
    expect(cuts[1].paddingPre).toBe(0); // floored
    expect(cuts[1].paddingPost).toBe(0);
  });

  it("loosens all cuts equally", () => {
    const cuts = [{ rawStart: 1, rawEnd: 2, paddingPre: 0.1, paddingPost: 0.2 }];
    applyGlobalPadding(cuts, 0.05);
    expect(cuts[0].paddingPre).toBeCloseTo(0.15);
    expect(cuts[0].paddingPost).toBeCloseTo(0.25);
  });
});

// ─── whisper.cpp parser ───────────────────────────────────────

describe("parseWhisperCppJson", () => {
  it("parses segment-level transcript with even-split word timing", () => {
    const json = JSON.stringify({
      result: { language: "en" },
      transcription: [
        {
          offsets: { from: 0, to: 2000 },
          text: " Hello world",
        },
      ],
    });
    const t = parseWhisperCppJson(json);
    expect(t.version).toBe("1.1");
    expect(t.language).toBe("en");
    expect(t.segments).toHaveLength(1);
    expect(t.segments[0].text).toBe("Hello world");
    expect(t.segments[0].words).toHaveLength(2);
    expect(t.segments[0].words[0].detected).toBe("Hello");
    expect(t.segments[0].words[0].start).toBe(0);
    expect(t.segments[0].words[1].start).toBeCloseTo(1.0);
  });

  it("uses token-level offsets when available", () => {
    const json = JSON.stringify({
      result: { language: "en" },
      transcription: [
        {
          offsets: { from: 0, to: 3000 },
          text: " I went home",
          tokens: [
            { text: " I", offsets: { from: 0, to: 200 }, p: 0.99 },
            { text: " went", offsets: { from: 300, to: 800 }, p: 0.95 },
            { text: " home", offsets: { from: 900, to: 1500 } },
          ],
        },
      ],
    });
    const t = parseWhisperCppJson(json);
    expect(t.segments[0].words).toHaveLength(3);
    expect(t.segments[0].words[0].start).toBe(0);
    expect(t.segments[0].words[0].end).toBeCloseTo(0.2);
    expect(t.segments[0].words[0].confidence).toBe(0.99);
    expect(t.segments[0].words[1].detected).toBe("went");
  });

  it("filters out empty and special tokens from token list", () => {
    const json = JSON.stringify({
      transcription: [
        {
          offsets: { from: 0, to: 1000 },
          text: " hi",
          tokens: [
            { text: "[_BEG_]", offsets: { from: 0, to: 0 } },
            { text: " hi", offsets: { from: 100, to: 500 } },
            { text: "  ", offsets: { from: 500, to: 600 } },
          ],
        },
      ],
    });
    const t = parseWhisperCppJson(json);
    expect(t.segments[0].words).toHaveLength(1);
    expect(t.segments[0].words[0].detected).toBe("hi");
  });

  it("returns empty segments for empty transcription", () => {
    const t = parseWhisperCppJson(JSON.stringify({ transcription: [] }));
    expect(t.segments).toEqual([]);
  });
});

// ─── transcript-model ─────────────────────────────────────────

function buildTestTranscript(): VideoTranscript {
  return {
    version: "1.1",
    language: "en",
    segments: [
      {
        text: "I went to the store",
        start: 0,
        end: 2,
        words: [
          { detected: "I", text: "I", start: 0, end: 0.2 },
          { detected: "went", text: "went", start: 0.3, end: 0.6 },
          { detected: "to", text: "to", start: 0.7, end: 0.85 },
          { detected: "the", text: "the", start: 0.9, end: 1.05 },
          { detected: "store.", text: "store.", start: 1.1, end: 1.6 },
        ],
      },
      {
        text: "Then I came back home",
        start: 2.2,
        end: 4,
        words: [
          { detected: "Then", text: "Then", start: 2.2, end: 2.5 },
          { detected: "I", text: "I", start: 2.6, end: 2.7 },
          { detected: "came", text: "came", start: 2.8, end: 3.1 },
          { detected: "back", text: "back", start: 3.2, end: 3.5 },
          { detected: "home.", text: "home.", start: 3.6, end: 4 },
        ],
      },
    ],
  };
}

describe("flattenWords", () => {
  it("flattens segments into a single ordered word array", () => {
    const flat = flattenWords(buildTestTranscript());
    expect(flat).toHaveLength(10);
    expect(flat[0].text).toBe("I");
    expect(flat[9].text).toBe("home.");
  });
});

describe("groupIntoPhrases", () => {
  it("breaks on end-of-sentence punctuation", () => {
    const phrases = groupIntoPhrases(buildTestTranscript());
    // "I went to the store." and "Then I came back home." → 2 phrases
    expect(phrases).toHaveLength(2);
    expect(phrases[0].text).toBe("I went to the store.");
    expect(phrases[1].text).toBe("Then I came back home.");
  });

  it("breaks at maxWords when no punctuation hit", () => {
    const t: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "one two three four five six",
          start: 0,
          end: 1.8,
          words: ["one", "two", "three", "four", "five", "six"].map((w, i) => ({
            detected: w, text: w, start: i * 0.3, end: i * 0.3 + 0.25,
          })),
        },
      ],
    };
    const phrases = groupIntoPhrases(t, { maxWords: 3, pauseGap: 0.5 });
    expect(phrases).toHaveLength(2);
    expect(phrases[0].words).toHaveLength(3);
    expect(phrases[1].words).toHaveLength(3);
  });

  it("breaks on pause gap exceeding threshold", () => {
    const t: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "hello world",
          start: 0,
          end: 5,
          words: [
            { detected: "hello", text: "hello", start: 0, end: 0.5 },
            { detected: "world", text: "world", start: 2.0, end: 2.5 },  // big gap
          ],
        },
      ],
    };
    const phrases = groupIntoPhrases(t, { maxWords: 10, pauseGap: 0.4 });
    expect(phrases).toHaveLength(2);
  });

  it("skips hidden words", () => {
    const t: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "um hello world",
          start: 0,
          end: 3,
          words: [
            { detected: "um", text: "um", start: 0, end: 0.3, hidden: true },
            { detected: "hello", text: "hello", start: 0.4, end: 0.8 },
            { detected: "world", text: "world", start: 0.9, end: 1.4 },
          ],
        },
      ],
    };
    const phrases = groupIntoPhrases(t, { maxWords: 5 });
    expect(phrases[0].text).toBe("hello world");
  });
});

describe("mergeTranscriptWithExisting", () => {
  it("preserves user-edited text when raw boundary matches", () => {
    const existing: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "I went to the door",
          start: 0,
          end: 2,
          words: [
            { detected: "I", text: "I", start: 0, end: 0.2 },
            { detected: "went", text: "went", start: 0.3, end: 0.6 },
            { detected: "door", text: "store", start: 1.1, end: 1.6, userEdited: true },
          ],
        },
      ],
    };
    const fresh: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "I went to the door",
          start: 0,
          end: 2,
          words: [
            { detected: "I", text: "I", start: 0.05, end: 0.25 },     // slight timing shift
            { detected: "went", text: "went", start: 0.35, end: 0.65 },
            { detected: "door", text: "door", start: 1.12, end: 1.62 }, // matches existing
          ],
        },
      ],
    };
    const merged = mergeTranscriptWithExisting(fresh, existing);
    const flat = flattenWords(merged);
    expect(flat[2].text).toBe("store");
    expect(flat[2].userEdited).toBe(true);
    expect(flat[2].start).toBe(1.12); // raw updated to fresh timing
  });

  it("preserves hidden flag on matching word", () => {
    const existing: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "um hello",
          start: 0,
          end: 1,
          words: [
            { detected: "um", text: "um", start: 0, end: 0.3, hidden: true },
            { detected: "hello", text: "hello", start: 0.4, end: 0.9 },
          ],
        },
      ],
    };
    const fresh: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "um hello",
          start: 0,
          end: 1,
          words: [
            { detected: "um", text: "um", start: 0, end: 0.3 },
            { detected: "hello", text: "hello", start: 0.4, end: 0.9 },
          ],
        },
      ],
    };
    const merged = mergeTranscriptWithExisting(fresh, existing);
    expect(merged.segments[0].words[0].hidden).toBe(true);
  });

  it("re-inserts user-added orphan words", () => {
    const existing: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "I went home",
          start: 0,
          end: 2,
          words: [
            { detected: "I", text: "I", start: 0, end: 0.2 },
            { detected: "really", text: "really", start: 0.3, end: 0.6, userAdded: true },
            { detected: "went", text: "went", start: 0.7, end: 1.0 },
            { detected: "home", text: "home", start: 1.1, end: 1.5 },
          ],
        },
      ],
    };
    const fresh: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "I went home",
          start: 0,
          end: 2,
          words: [
            { detected: "I", text: "I", start: 0, end: 0.2 },
            { detected: "went", text: "went", start: 0.7, end: 1.0 },
            { detected: "home", text: "home", start: 1.1, end: 1.5 },
          ],
        },
      ],
    };
    const merged = mergeTranscriptWithExisting(fresh, existing);
    const flat = flattenWords(merged);
    const reallyWord = flat.find((w) => w.text === "really");
    expect(reallyWord).toBeDefined();
    expect(reallyWord!.userAdded).toBe(true);
  });

  it("does not preserve override when detected text changes", () => {
    const existing: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "door",
          start: 1.0,
          end: 1.5,
          words: [{ detected: "door", text: "store", start: 1.1, end: 1.5, userEdited: true }],
        },
      ],
    };
    const fresh: VideoTranscript = {
      version: "1.1",
      segments: [
        {
          text: "door",
          start: 1.0,
          end: 1.5,
          words: [{ detected: "floor", text: "floor", start: 1.1, end: 1.5 }],
        },
      ],
    };
    const merged = mergeTranscriptWithExisting(fresh, existing);
    expect(merged.segments[0].words[0].text).toBe("floor");
    expect(merged.segments[0].words[0].userEdited).toBeUndefined();
  });
});

describe("applyTextEdit", () => {
  it("updates text and sets userEdited", () => {
    const t = applyTextEdit(buildTestTranscript(), 0, "Eye");
    expect(t.segments[0].words[0].text).toBe("Eye");
    expect(t.segments[0].words[0].detected).toBe("I");
    expect(t.segments[0].words[0].userEdited).toBe(true);
  });

  it("throws on out-of-range index", () => {
    expect(() => applyTextEdit(buildTestTranscript(), 999, "x")).toThrow("out of range");
  });
});

describe("applyBatchReplace", () => {
  it("replaces all occurrences of a detected word, marks each userEdited", () => {
    const t = applyBatchReplace(buildTestTranscript(), "I", "Eye");
    // Two "I" words across segments
    expect(t.segments[0].words[0].text).toBe("Eye");
    expect(t.segments[1].words[1].text).toBe("Eye");
    expect(t.segments[0].words[0].userEdited).toBe(true);
  });
});

describe("applyHide", () => {
  it("sets hidden=true on the target word", () => {
    const t = applyHide(buildTestTranscript(), 0);
    expect(t.segments[0].words[0].hidden).toBe(true);
  });
});

describe("applyAdd", () => {
  it("inserts a new word after the anchor, marks userAdded", () => {
    const t = applyAdd(buildTestTranscript(), 1, "really", 0.2);
    expect(t.segments[0].words[2].text).toBe("really");
    expect(t.segments[0].words[2].userAdded).toBe(true);
    expect(t.segments[0].words[2].start).toBeCloseTo(0.6);
    expect(t.segments[0].words[2].end).toBeCloseTo(0.8);
  });

  it("inserts at end of correct segment when index is last in that segment", () => {
    const t = applyAdd(buildTestTranscript(), 4, "indeed");
    // Word 4 is "store." in segment 0. Insert goes into segment 0 as last word
    expect(t.segments[0].words[5].text).toBe("indeed");
    expect(t.segments[1].words).toHaveLength(5); // unchanged
  });
});

describe("applyMerge", () => {
  it("merges adjacent words into one", () => {
    const t = applyMerge(buildTestTranscript(), 0); // "I" + "went" → "Iwent"
    expect(t.segments[0].words).toHaveLength(4);
    expect(t.segments[0].words[0].detected).toBe("Iwent");
    expect(t.segments[0].words[0].start).toBe(0);
    expect(t.segments[0].words[0].end).toBe(0.6);
    expect(t.segments[0].words[0].userEdited).toBe(true);
  });

  it("does not cross segment boundaries", () => {
    // Word 4 is last of seg 0; word 5 is first of seg 1 — merge attempt is a no-op
    const t = applyMerge(buildTestTranscript(), 4);
    expect(t.segments[0].words).toHaveLength(5);
    expect(t.segments[1].words).toHaveLength(5);
  });
});

describe("applySplit", () => {
  it("splits one word into two with prorated timing", () => {
    const t = applySplit(buildTestTranscript(), 0, 0.5, "I", "I");
    // "I" word 0 has start=0, end=0.2 → split at 0.1
    expect(t.segments[0].words).toHaveLength(6);
    expect(t.segments[0].words[0].end).toBe(0.1);
    expect(t.segments[0].words[1].start).toBe(0.1);
    expect(t.segments[0].words[1].end).toBe(0.2);
  });

  it("throws on fraction outside (0,1)", () => {
    expect(() => applySplit(buildTestTranscript(), 0, 0)).toThrow();
    expect(() => applySplit(buildTestTranscript(), 0, 1)).toThrow();
  });

  it("defaults to character-midpoint text split", () => {
    const t = applySplit(buildTestTranscript(), 1, 0.5);  // "went" → "we" + "nt"
    expect(t.segments[0].words[1].text).toBe("we");
    expect(t.segments[0].words[2].text).toBe("nt");
  });
});

// ─── caption-builder ─────────────────────────────────────────

describe("buildCaptionLayers", () => {
  it("produces one caption layer per phrase with correct tags", () => {
    const t = buildTestTranscript();
    const canvas = { width: 1920, height: 1080, fps: 30 };
    const { layers, deltas } = buildCaptionLayers(t, canvas);

    expect(layers).toHaveLength(2);
    expect(layers[0].id).toBe("caption-0");
    expect(layers[0].tags).toEqual(["caption"]);
    expect((layers[0].visual as { type: string }).type).toBe("text");
    expect((layers[0].visual as { content: string }).content).toBe("I went to the store.");
    // Each phrase contributes a fade-in + fade-out delta
    expect(deltas).toHaveLength(4);
    expect(deltas.every((d) => d.property === "opacity")).toBe(true);
  });

  it("positions captions at canvas.height * yRatio", () => {
    const t = buildTestTranscript();
    const canvas = { width: 1920, height: 1080, fps: 30 };
    const { layers } = buildCaptionLayers(t, canvas, { style: { yRatio: 0.5 } });
    expect(layers[0].frame.y).toBe(540);
  });

  it("applies custom style overrides", () => {
    const t = buildTestTranscript();
    const canvas = { width: 1920, height: 1080, fps: 30 };
    const { layers } = buildCaptionLayers(t, canvas, {
      style: { color: "#FFD700", fontSize: 100 },
    });
    const style = (layers[0].visual as { style: { color: string; fontSize: number } }).style;
    expect(style.color).toBe("#FFD700");
    expect(style.fontSize).toBe(100);
  });
});

describe("rewriteCaptionLayers", () => {
  let capFakeSrc: string;
  beforeAll(() => {
    capFakeSrc = join(tmpDir, "caption-sample.mp4");
    writeFileSync(capFakeSrc, "FAKE_VIDEO_BYTES", "utf-8");
  });

  it("preserves non-caption layers and other-tagged pipeline layers", async () => {
    const projectDir = join(tmpDir, "vp-captions-rewrite");
    const project = await createVideoProject(capFakeSrc, projectDir);
    const doc = readComposition(project);

    // Add a silence-trim layer + a user-authored overlay
    doc.layers.push({
      id: "clip-trim-0",
      tags: ["silence-trim"],
      visual: { type: "video", assetId: "src", src: "source.mp4", startFrame: 0, sourceOffset: 0, sourceEnd: 5, objectFit: "contain" },
      frame: { x: 0, y: 0 },
      bounds: { width: 1920, height: 1080 },
    });
    doc.layers.push({
      id: "user-overlay",
      visual: { type: "text", content: "intro", style: { fontFamily: "Inter", fontSize: 60, color: "#FFF" } },
      frame: { x: 100, y: 100 },
      bounds: { width: 400, height: 80 },
    });

    const updated = rewriteCaptionLayers(doc, buildTestTranscript());
    expect(updated.layers.find((l) => l.id === "clip-trim-0")).toBeDefined();
    expect(updated.layers.find((l) => l.id === "user-overlay")).toBeDefined();
    expect(updated.layers.filter((l) => (l.tags ?? []).includes("caption"))).toHaveLength(2);
  });

  it("writes caption deltas into the default state", async () => {
    const projectDir = join(tmpDir, "vp-captions-deltas");
    const project = await createVideoProject(capFakeSrc, projectDir);
    const doc = readComposition(project);
    const updated = rewriteCaptionLayers(doc, buildTestTranscript());
    expect(updated.states.default.deltas.length).toBeGreaterThan(0);
    expect(
      updated.states.default.deltas.every((d) => d.property === "opacity"),
    ).toBe(true);
  });

  it("replaces existing caption deltas, not appends", async () => {
    const projectDir = join(tmpDir, "vp-captions-replace");
    const project = await createVideoProject(capFakeSrc, projectDir);
    const doc = readComposition(project);
    const once = rewriteCaptionLayers(doc, buildTestTranscript());
    const onceCount = once.states.default.deltas.length;
    const twice = rewriteCaptionLayers(once, buildTestTranscript());
    expect(twice.states.default.deltas.length).toBe(onceCount);
  });
});

// ─── Studio Recipe ───────────────────────────────────────────

describe("scaffoldRecipeYaml", () => {
  it("produces a valid YAML that loadRecipe accepts", async () => {
    const yaml = scaffoldRecipeYaml("my-style");
    const yamlPath = join(tmpDir, "scaffold-test.recipe.yaml");
    writeFileSync(yamlPath, yaml, "utf-8");
    const loaded = loadRecipe(yamlPath);
    expect(loaded.recipe.version).toBe(RECIPE_VERSION);
    expect(loaded.recipe.name).toBe("my-style");
    expect(loaded.recipe.silence_policy?.default_padding_pre).toBe(0.08);
    expect(loaded.recipe.caption_style?.font_family).toBe("Inter");
    expect(loaded.warnings).toHaveLength(0);
  });

  it("includes a commented overlay_rules block in the scaffold output", () => {
    const yaml = scaffoldRecipeYaml("my-style");
    // The commented overlay_rules block should be present so authors discover it.
    expect(yaml).toMatch(/# overlay_rules:/);
    expect(yaml).toMatch(/#\s+handle:/);
    expect(yaml).toMatch(/#\s+page_number:/);
    expect(yaml).toMatch(/\{current\}\/\{total\}/);
  });

  it("uncommenting overlay_rules in the scaffold yields a valid recipe", () => {
    const scaffold = scaffoldRecipeYaml("uncomment-test");
    // Uncomment lines from "# overlay_rules:" up to the next blank line — the
    // entire overlay_rules block. The Phase 3 comment block after it stays
    // commented, exercising the partial-uncomment path real users take.
    const lines = scaffold.split("\n");
    const start = lines.findIndex((l) => l.startsWith("# overlay_rules:"));
    expect(start).toBeGreaterThanOrEqual(0);
    let end = start;
    while (end < lines.length && lines[end].startsWith("#")) end++;
    for (let i = start; i < end; i++) {
      lines[i] = lines[i].replace(/^# ?/, "");
    }
    const yaml = lines.join("\n");

    const yamlPath = join(tmpDir, "uncommented-overlay.recipe.yaml");
    writeFileSync(yamlPath, yaml, "utf-8");
    const loaded = loadRecipe(yamlPath);
    expect(loaded.recipe.overlay_rules?.handle?.text).toBe("@username");
    expect(loaded.recipe.overlay_rules?.handle?.anchor).toBe("bottom-left");
    expect(loaded.recipe.overlay_rules?.page_number?.format).toBe("{current}/{total}");
    expect(loaded.recipe.overlay_rules?.page_number?.anchor).toBe("top-right");
    // overlay_rules is no longer reserved — no warning about it
    expect(loaded.warnings.some((w) => /overlay_rules/.test(w))).toBe(false);
  });
});

describe("loadRecipe", () => {
  it("loads a partial recipe (missing fields are OK)", () => {
    const path = join(tmpDir, "partial.recipe.yaml");
    writeFileSync(
      path,
      `version: "1.0"\nname: "partial"\nsilence_policy:\n  default_padding_pre: 0.05\n`,
      "utf-8",
    );
    const loaded = loadRecipe(path);
    expect(loaded.recipe.name).toBe("partial");
    expect(loaded.recipe.silence_policy?.default_padding_pre).toBe(0.05);
    expect(loaded.recipe.caption_style).toBeUndefined();
  });

  it("warns when reserved Phase 3 fields are present", () => {
    const path = join(tmpDir, "phase3.recipe.yaml");
    writeFileSync(
      path,
      `version: "1.0"\nname: "phase3-preview"\npalette: { primary: "#FF0000" }\n`,
      "utf-8",
    );
    const loaded = loadRecipe(path);
    expect(loaded.warnings.length).toBeGreaterThan(0);
    expect(loaded.warnings[0]).toMatch(/palette/);
  });

  it("throws on schema-invalid recipe (wrong types)", () => {
    const path = join(tmpDir, "bad-types.recipe.yaml");
    writeFileSync(
      path,
      `version: "1.0"\nname: "bad"\nsilence_policy:\n  default_padding_pre: "fast"\n`,
      "utf-8",
    );
    expect(() => loadRecipe(path)).toThrow(/Invalid recipe/);
  });

  it("accepts JSON files", () => {
    const path = join(tmpDir, "json-recipe.recipe.json");
    writeFileSync(
      path,
      JSON.stringify({ version: "1.0", name: "json-style", caption_style: { font_size: 100 } }),
      "utf-8",
    );
    const loaded = loadRecipe(path);
    expect(loaded.recipe.name).toBe("json-style");
    expect(loaded.recipe.caption_style?.font_size).toBe(100);
  });

  it("throws with helpful message when recipe name not found", () => {
    expect(() => loadRecipe("nonexistent-recipe-xyz")).toThrow(/not found/);
  });
});

describe("resolveRecipePath", () => {
  it("treats absolute paths as literal", () => {
    const p = join(tmpDir, "absolute.recipe.yaml");
    writeFileSync(p, `version: "1.0"\nname: "t"`, "utf-8");
    expect(resolveRecipePath(p)).toBe(p);
  });

  it("resolves project-local recipes before user library", async () => {
    const { mkdirSync } = await import("node:fs");
    const projectDir = join(tmpDir, "rp-project");
    mkdirSync(join(projectDir, ".atelier", "recipes"), { recursive: true });
    const projectRecipe = join(projectDir, ".atelier", "recipes", "test-recipe.recipe.yaml");
    writeFileSync(projectRecipe, `version: "1.0"\nname: "project"`, "utf-8");
    const resolved = resolveRecipePath("test-recipe", projectDir);
    expect(resolved).toBe(projectRecipe);
  });
});

// ─── recipe new / validate command round-trip (Commit B) ──────────
//
// Regression for the path-resolution mismatch: `recipe new <name>` writes to
// the PROJECT dir (./.atelier/recipes/) but `recipe validate <name>` resolved
// the bare name against ~/.atelier/recipes/ only, so the just-created file was
// never found. Both must now agree on project-local resolution. We drive the
// real commands with cwd pinned to a temp project dir.

/** Run a recipe subcommand with cwd pinned + stdout/stderr/exit captured. */
async function runRecipe(
  argv: string[],
  cwd: string,
): Promise<{ code?: number; stdout: string; stderr: string }> {
  const program = new Command();
  program.exitOverride();
  recipeCommand(program);

  const origExit = process.exit;
  const origLog = console.log;
  const origErr = console.error;
  const origCwd = process.cwd;
  let exitCode: number | undefined;
  let stdout = "";
  let stderr = "";

  process.cwd = () => cwd;
  (process.exit as unknown as (c?: number) => void) = ((c?: number) => {
    exitCode = c;
    throw new Error(`__exit_${c ?? 0}__`);
  }) as never;
  console.log = (msg?: unknown) => { stdout += String(msg) + "\n"; };
  console.error = (msg?: unknown) => { stderr += String(msg) + "\n"; };

  try {
    await program.parseAsync(["node", "atelier", "recipe", ...argv]);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith("__exit_")) {
      const cErr = err as { code?: string; exitCode?: number };
      if (cErr?.code?.startsWith("commander.")) {
        exitCode = cErr.exitCode ?? 1;
      } else {
        throw err;
      }
    }
  } finally {
    process.exit = origExit;
    console.log = origLog;
    console.error = origErr;
    process.cwd = origCwd;
  }
  return { code: exitCode, stdout, stderr };
}

describe("recipe new/validate path resolution (Commit B)", () => {
  it("validate finds a bare name that new just wrote (project-local round-trip)", async () => {
    const projectDir = join(tmpDir, "recipe-rt-bare");
    mkdirSync(projectDir, { recursive: true });

    const created = await runRecipe(["new", "demo"], projectDir);
    expect(created.code).toBeUndefined(); // no exit → success
    expect(
      existsSync(join(projectDir, ".atelier", "recipes", "demo.recipe.yaml")),
    ).toBe(true);

    const validated = await runRecipe(["validate", "demo"], projectDir);
    expect(validated.code).toBeUndefined(); // resolves + passes
    expect(validated.stdout).toMatch(/PASS/);
  });

  it("show also resolves a bare project-local name", async () => {
    const projectDir = join(tmpDir, "recipe-rt-show");
    mkdirSync(projectDir, { recursive: true });
    await runRecipe(["new", "showme"], projectDir);

    const shown = await runRecipe(["show", "showme"], projectDir);
    expect(shown.code).toBeUndefined();
    expect(shown.stdout).toMatch(/name: showme/);
  });

  it("new with an explicit .recipe.yaml name does not double the extension", async () => {
    const projectDir = join(tmpDir, "recipe-double-ext");
    mkdirSync(projectDir, { recursive: true });

    const created = await runRecipe(["new", "foo.recipe.yaml"], projectDir);
    expect(created.code).toBeUndefined();

    const recipesDir = join(projectDir, ".atelier", "recipes");
    expect(existsSync(join(recipesDir, "foo.recipe.yaml"))).toBe(true);
    expect(existsSync(join(recipesDir, "foo.recipe.yaml.recipe.yaml"))).toBe(false);
    // And the scaffold's name field uses the clean stem, not the filename.
    const body = readFileSync(join(recipesDir, "foo.recipe.yaml"), "utf-8");
    expect(body).toMatch(/name: "foo"/);
  });

  it("new with a bare .yaml name keeps the single extension", async () => {
    const projectDir = join(tmpDir, "recipe-yaml-ext");
    mkdirSync(projectDir, { recursive: true });

    await runRecipe(["new", "bar.yaml"], projectDir);
    const recipesDir = join(projectDir, ".atelier", "recipes");
    expect(existsSync(join(recipesDir, "bar.yaml"))).toBe(true);
    expect(existsSync(join(recipesDir, "bar.yaml.recipe.yaml"))).toBe(false);
  });
});

describe("applyRecipeToTrimOptions", () => {
  const recipe: StudioRecipe = {
    version: "1.0",
    name: "test",
    silence_policy: {
      noise: "-25dB",
      min_silence: 0.5,
      default_padding_pre: 0.1,
      default_padding_post: 0.15,
      match_tolerance: 0.7,
    },
  };

  it("merges recipe silence_policy into TrimOptions", () => {
    const merged = applyRecipeToTrimOptions(recipe, {});
    expect(merged.noise).toBe("-25dB");
    expect(merged.minSilence).toBe(0.5);
    expect(merged.padPre).toBe(0.1);
    expect(merged.padPost).toBe(0.15);
    expect(merged.matchTolerance).toBe(0.7);
  });

  it("CLI options take precedence over recipe", () => {
    const merged = applyRecipeToTrimOptions(recipe, { padPre: 0.2, noise: "-40dB" });
    expect(merged.padPre).toBe(0.2);
    expect(merged.noise).toBe("-40dB");
    // Recipe still fills the un-overridden fields
    expect(merged.padPost).toBe(0.15);
  });

  it("returns CLI options untouched when no recipe", () => {
    const merged = applyRecipeToTrimOptions(undefined, { padPre: 0.3 });
    expect(merged.padPre).toBe(0.3);
    expect(merged.noise).toBeUndefined();
  });
});

describe("applyRecipeToCaptionOptions", () => {
  it("translates snake_case recipe fields to camelCase BuildCaptionsOptions", () => {
    const opts = applyRecipeToCaptionOptions({
      version: "1.0",
      name: "t",
      caption_style: { font_family: "Inter", font_size: 100, y_ratio: 0.5 },
      caption_grouping: { max_words: 7, pause_gap: 0.6 },
    });
    expect(opts.style?.fontFamily).toBe("Inter");
    expect(opts.style?.fontSize).toBe(100);
    expect(opts.style?.yRatio).toBe(0.5);
    expect(opts.maxWords).toBe(7);
    expect(opts.pauseGap).toBe(0.6);
  });

  it("returns empty options when no recipe", () => {
    expect(applyRecipeToCaptionOptions(undefined)).toEqual({});
  });

  it("omits style object entirely when caption_style absent", () => {
    const opts = applyRecipeToCaptionOptions({
      version: "1.0",
      name: "t",
      caption_grouping: { max_words: 3 },
    });
    expect(opts.style).toBeUndefined();
    expect(opts.maxWords).toBe(3);
  });
});

describe("applyRecipeToTranscribeOptions", () => {
  it("attaches captionOptions to TranscribeOptions when recipe present", () => {
    const merged = applyRecipeToTranscribeOptions(
      {
        version: "1.0",
        name: "t",
        caption_style: { color: "#FFD700" },
      },
      { model: "base.en" },
    );
    expect(merged.model).toBe("base.en");
    expect(merged.captionOptions?.style?.color).toBe("#FFD700");
  });

  it("passes through unchanged when no recipe", () => {
    expect(applyRecipeToTranscribeOptions(undefined, { reset: true })).toEqual({ reset: true });
  });
});

describe("renderRecipeWithDefaults", () => {
  it("fills in every Phase 1 code default for fields the recipe omits", () => {
    const filled = renderRecipeWithDefaults({
      version: "1.0",
      name: "minimal",
      silence_policy: { default_padding_pre: 0.05 },
    });
    expect(filled.silence_policy?.default_padding_pre).toBe(0.05);
    expect(filled.silence_policy?.default_padding_post).toBe(0.12);
    expect(filled.silence_policy?.noise).toBe("-30dB");
    expect(filled.caption_style?.font_family).toBe("Inter");
    expect(filled.caption_grouping?.max_words).toBe(5);
  });
});

// ─── Welcome template ────────────────────────────────────────
// The first-run scaffold (atelier studio in an empty dir) copies
// templates/welcome.atelier into CWD. Round-trip it through parseAtelier
// to lock in that the template stays schema-valid as the schema evolves.

describe("welcome.atelier template", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/ → ../templates/welcome.atelier
  const templatePath = resolve(here, "..", "templates", "welcome.atelier");

  it("ships in packages/cli/templates/", () => {
    expect(existsSync(templatePath), `expected template at ${templatePath}`).toBe(true);
  });

  it("parses cleanly via parseAtelier (schema-valid)", () => {
    const content = readFileSync(templatePath, "utf-8");
    const result = parseAtelier(content);
    expect(result.success, `parse errors: ${result.success ? "" : JSON.stringify(result.errors)}`).toBe(true);
    if (!result.success) return;
    const doc = result.data;
    // Sanity: the expected first-run shape.
    expect(doc.canvas.width).toBe(1080);
    expect(doc.canvas.height).toBe(1080);
    expect(doc.canvas.background).toBe("#0F1115");
    // Overlay-tagged layers exist for the layer-tag isolation invariant.
    const overlayLayers = doc.layers.filter((l) => l.tags?.includes("overlay"));
    expect(overlayLayers.length).toBeGreaterThanOrEqual(2);
    // Default state with at least one delta so the user sees motion on open.
    expect(doc.states.default).toBeDefined();
    expect(doc.states.default.deltas.length).toBeGreaterThan(0);
  });

  // v1 regression guard — section 2.1 of .paradigm/specs/v1-testing-strategy.md
  // Snapshots the resolved scene at a key frame so unintended changes to the
  // welcome template, default values, or easing-output behavior fail loudly.
  it("resolves to a stable scene at frame 15 of default state (snapshot)", async () => {
    const content = readFileSync(templatePath, "utf-8");
    const result = parseAtelier(content);
    if (!result.success) throw new Error(`welcome.atelier failed to parse: ${JSON.stringify(result.errors)}`);
    const { resolveFrame } = await import("@a-company/atelier-core");
    const resolved = resolveFrame(result.data, "default", 15);
    // Snapshot a deterministic projection: layer ids, types, computed opacity,
    // frame, tags. Excludes anything time-or-environment-sensitive. ResolvedLayer
    // keeps the original layer under `.layer` and animated values under
    // `.computedProperties`.
    const projection = resolved.layers.map((l) => ({
      id: l.id,
      type: l.layer.visual.type,
      opacity: (l.computedProperties.opacity as number | undefined) ?? l.layer.opacity ?? 1,
      frame: l.layer.frame,
      bounds: l.layer.bounds,
      tags: l.layer.tags ?? [],
    }));
    expect(projection).toMatchSnapshot();
  });
});

describe("recipeToYaml", () => {
  it("round-trips a recipe through YAML", () => {
    const recipe: StudioRecipe = {
      version: "1.0",
      name: "rt",
      silence_policy: { default_padding_pre: 0.05 },
    };
    const yaml = recipeToYaml(recipe);
    const path = join(tmpDir, "rt.recipe.yaml");
    writeFileSync(path, yaml, "utf-8");
    const loaded = loadRecipe(path);
    expect(loaded.recipe.name).toBe("rt");
    expect(loaded.recipe.silence_policy?.default_padding_pre).toBe(0.05);
  });
});

describe("renderPageNumberFormat", () => {
  it("renders {current}/{total} with 1-based indexing", () => {
    expect(renderPageNumberFormat("{current}/{total}", 1, 5)).toBe("1/5");
    expect(renderPageNumberFormat("{current}/{total}", 3, 5)).toBe("3/5");
  });

  it("renders zero-padded forms {current:02d}/{total:02d}", () => {
    expect(renderPageNumberFormat("{current:02d}/{total:02d}", 1, 5)).toBe("01/05");
    expect(renderPageNumberFormat("{current:03d}/{total:03d}", 1, 5)).toBe("001/005");
  });

  it("accepts surrounding literal text", () => {
    expect(renderPageNumberFormat("Page {current} of {total}", 2, 7)).toBe("Page 2 of 7");
  });
});

describe("applyRecipeToOverlay", () => {
  const baseDoc = (): import("@a-company/atelier-types").AtelierDocument => ({
    version: "1.0",
    name: "test",
    canvas: { width: 1080, height: 1080, fps: 30, background: "#000" },
    layers: [
      { id: "user-card", visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#fff" }}, frame: { x: 0, y: 0 }, bounds: { width: 1080, height: 1080 }},
    ],
    states: { default: { duration: 30, deltas: [] }},
  });

  it("adds a handle overlay layer tagged 'overlay'", () => {
    const recipe: StudioRecipe = {
      version: "1.0",
      name: "handle-only",
      overlay_rules: { handle: { text: "@me", anchor: "bottom-left" }},
    };
    const out = applyRecipeToOverlay(baseDoc(), recipe);
    const handle = out.layers.find((l) => l.id === "overlay-handle");
    expect(handle).toBeDefined();
    expect(handle?.tags).toContain("overlay");
    expect((handle?.visual as { content: string }).content).toBe("@me");
  });

  it("renders page_number when carousel ctx is provided", () => {
    const recipe: StudioRecipe = {
      version: "1.0",
      name: "page-only",
      overlay_rules: { page_number: { format: "{current:02d}/{total:02d}", anchor: "bottom-right" }},
    };
    const out = applyRecipeToOverlay(baseDoc(), recipe, { currentIndex: 1, totalCount: 5 });
    const page = out.layers.find((l) => l.id === "overlay-page-number");
    expect(page).toBeDefined();
    expect((page?.visual as { content: string }).content).toBe("01/05");
  });

  it("skips page_number when ctx is missing (single-frame apply)", () => {
    const recipe: StudioRecipe = {
      version: "1.0",
      name: "page-only",
      overlay_rules: { page_number: { format: "{current}/{total}", anchor: "bottom-right" }},
    };
    const out = applyRecipeToOverlay(baseDoc(), recipe);
    expect(out.layers.find((l) => l.id === "overlay-page-number")).toBeUndefined();
  });

  it("is idempotent — re-applying drops prior overlay layers before re-adding", () => {
    const recipe: StudioRecipe = {
      version: "1.0",
      name: "h",
      overlay_rules: { handle: { text: "@me", anchor: "top-right" }},
    };
    const once = applyRecipeToOverlay(baseDoc(), recipe);
    const twice = applyRecipeToOverlay(once, recipe);
    const handles = twice.layers.filter((l) => l.id === "overlay-handle");
    expect(handles.length).toBe(1);
  });

  it("leaves user-authored layers (untagged) untouched", () => {
    const recipe: StudioRecipe = {
      version: "1.0",
      name: "h",
      overlay_rules: { handle: { text: "@me", anchor: "bottom-left" }},
    };
    const out = applyRecipeToOverlay(baseDoc(), recipe);
    expect(out.layers.find((l) => l.id === "user-card")).toBeDefined();
  });
});

// ─── Export Image (PNG) Tests ────────────────────────────────

/** Build a fresh commander program with only export-image registered. */
function makeExportImageProgram(): Command {
  const program = new Command();
  program.exitOverride(); // throw instead of process.exit
  exportImageCommand(program);
  return program;
}

/**
 * Read PNG dimensions from a file. PNG layout: 8-byte signature, then an
 * IHDR chunk where width is bytes 16–19 and height is bytes 20–23 (both
 * big-endian uint32).
 */
function readPngDimensions(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

/** PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A */
function isPng(path: string): boolean {
  const buf = readFileSync(path);
  return (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

/**
 * Run the export-image command, capturing process.exit calls so the test
 * runner doesn't terminate. Returns the exit code (0 = success, undefined
 * if no exit was attempted, or the code passed to process.exit).
 */
async function runExportImage(
  argv: string[],
): Promise<{ code?: number; stderr: string }> {
  const program = makeExportImageProgram();
  const origExit = process.exit;
  const origErr = console.error;
  let exitCode: number | undefined;
  let stderr = "";
  (process.exit as unknown as (c?: number) => void) = ((c?: number) => {
    exitCode = c;
    throw new Error(`__exit_${c ?? 0}__`);
  }) as never;
  console.error = (msg?: unknown) => {
    stderr += String(msg) + "\n";
  };
  try {
    await program.parseAsync(["node", "atelier", "export-image", ...argv]);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith("__exit_")) {
      // Re-throw unexpected errors (commander's exitOverride throws CommanderError)
      const cErr = err as { code?: string; exitCode?: number };
      if (cErr?.code === "commander.missingMandatoryOptionValue" || cErr?.code === "commander.missingArgument") {
        exitCode = cErr.exitCode ?? 1;
      } else if (!(err instanceof Error)) {
        throw err;
      }
    }
  } finally {
    process.exit = origExit;
    console.error = origErr;
  }
  return { code: exitCode, stderr };
}

describe("resolveExportDimensions", () => {
  it("returns doc dimensions when no overrides", () => {
    expect(resolveExportDimensions(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it("preserves aspect when only width is set", () => {
    expect(resolveExportDimensions(1920, 1080, 960)).toEqual({ width: 960, height: 540 });
  });

  it("preserves aspect when only height is set", () => {
    expect(resolveExportDimensions(1920, 1080, undefined, 540)).toEqual({ width: 960, height: 540 });
  });

  it("uses both dims verbatim when both are set (may squash)", () => {
    expect(resolveExportDimensions(1920, 1080, 500, 500)).toEqual({ width: 500, height: 500 });
  });
});

describe("atelier export-image", () => {
  it(
    "writes a PNG file at the requested path with the requested dimensions",
    async () => {
      const yaml = serializeAtelier(VALID_DOC);
      const inPath = writeTmpFile("export-image-custom.atelier", yaml);
      const outPath = join(tmpDir, "export-image-custom.png");
      const { code } = await runExportImage([
        inPath,
        "--out", outPath,
        "--state", "intro",
        "--frame", "0",
        "--width", "640",
        "--height", "360",
      ]);
      expect(code).toBeUndefined();
      expect(existsSync(outPath)).toBe(true);
      expect(isPng(outPath)).toBe(true);
      const dims = readPngDimensions(outPath);
      expect(dims).toEqual({ width: 640, height: 360 });
    },
  );

  it(
    "defaults to frame 0, first state, and the document's canvas dimensions",
    async () => {
      const yaml = serializeAtelier(VALID_DOC);
      const inPath = writeTmpFile("export-image-defaults.atelier", yaml);
      const outPath = join(tmpDir, "export-image-defaults.png");
      const { code } = await runExportImage([inPath, "--out", outPath]);
      expect(code).toBeUndefined();
      expect(existsSync(outPath)).toBe(true);
      expect(isPng(outPath)).toBe(true);
      const dims = readPngDimensions(outPath);
      expect(dims).toEqual({
        width: VALID_DOC.canvas.width,
        height: VALID_DOC.canvas.height,
      });
    },
  );

  it("errors gracefully when input file is missing", async () => {
    const missing = join(tmpDir, "does-not-exist.atelier");
    const outPath = join(tmpDir, "noop.png");
    const { code, stderr } = await runExportImage([missing, "--out", outPath]);
    expect(code).toBe(1);
    expect(stderr).toContain("Cannot read file");
    expect(existsSync(outPath)).toBe(false);
  });

  it("errors gracefully when state doesn't exist", async () => {
    const yaml = serializeAtelier(VALID_DOC);
    const inPath = writeTmpFile("export-image-bad-state.atelier", yaml);
    const outPath = join(tmpDir, "bad-state.png");
    const { code, stderr } = await runExportImage([
      inPath,
      "--out", outPath,
      "--state", "nonexistent",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain('State "nonexistent" not found');
    expect(existsSync(outPath)).toBe(false);
  });

  it("errors gracefully when frame is out of state's duration", async () => {
    const yaml = serializeAtelier(VALID_DOC);
    const inPath = writeTmpFile("export-image-bad-frame.atelier", yaml);
    const outPath = join(tmpDir, "bad-frame.png");
    // VALID_DOC.states.intro.duration === 60
    const { code, stderr } = await runExportImage([
      inPath,
      "--out", outPath,
      "--state", "intro",
      "--frame", "999",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("out of range");
    expect(existsSync(outPath)).toBe(false);
  });
});

// ─── Studio bridge wiring ─────────────────────────────────────
//
// Unit-tests for the WebSocket bridge helpers exported by the studio
// command. We exercise the pure logic (attach, broadcast, origin check)
// against a hand-rolled FakeWs that conforms to the slice of `ws` we use,
// so the tests don't bind a real port.

import {
  attachBridgeClient,
  broadcastToBridge,
  isAllowedOrigin,
  isAllowedMcpOrigin,
  isSafePath,
  shouldBroadcastMutation,
  writeFileEnsuringDir,
  type BridgeSessionState,
} from "./commands/studio.js";
import { SaveCoordinator } from "./lib/studio-save-coordinator.js";
import { DocumentStore } from "@a-company/atelier-mcp";

class FakeBridgeWs {
  public readyState = 1; // OPEN
  public sent: string[] = [];
  public OPEN = 1;
  private handlers = new Map<string, Array<(arg: unknown) => void>>();

  on(event: string, listener: (...args: unknown[]) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(listener as (arg: unknown) => void);
    this.handlers.set(event, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    for (const h of this.handlers.get("close") ?? []) h(undefined);
  }

  deliver(text: string): void {
    for (const h of this.handlers.get("message") ?? []) h(text);
  }

  parsed(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

function bridgeDoc(name = "bridge-doc"): AtelierDocument {
  return {
    version: "1.0",
    name,
    canvas: { width: 100, height: 100, fps: 30 },
    layers: [],
    states: { default: { duration: 60, deltas: [] } },
  };
}

describe("studio bridge — isAllowedOrigin", () => {
  it("accepts localhost + 127.0.0.1 on the same port", () => {
    expect(isAllowedOrigin("http://localhost:4321", 4321)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4321", 4321)).toBe(true);
  });

  it("rejects undefined, mismatched port, or foreign origins", () => {
    expect(isAllowedOrigin(undefined, 4321)).toBe(false);
    expect(isAllowedOrigin("http://localhost:9999", 4321)).toBe(false);
    expect(isAllowedOrigin("http://evil.example", 4321)).toBe(false);
    expect(isAllowedOrigin("https://localhost:4321", 4321)).toBe(false);
  });
});

describe("studio bridge — isAllowedMcpOrigin", () => {
  it("tolerates a MISSING Origin (non-browser MCP clients send none)", () => {
    // /bridge would reject this; /mcp must allow it or the feature is dead.
    expect(isAllowedOrigin(undefined, 4321)).toBe(false);
    expect(isAllowedMcpOrigin(undefined, 4321)).toBe(true);
  });

  it("accepts a same-origin browser Origin", () => {
    expect(isAllowedMcpOrigin("http://localhost:4321", 4321)).toBe(true);
    expect(isAllowedMcpOrigin("http://127.0.0.1:4321", 4321)).toBe(true);
  });

  it("still rejects a PRESENT-but-foreign Origin (evil.com tab)", () => {
    expect(isAllowedMcpOrigin("http://evil.example", 4321)).toBe(false);
    expect(isAllowedMcpOrigin("http://localhost:9999", 4321)).toBe(false);
    expect(isAllowedMcpOrigin("https://localhost:4321", 4321)).toBe(false);
  });
});

describe("studio bridge — shouldBroadcastMutation", () => {
  it("broadcasts ONLY llm-sourced changes", () => {
    expect(shouldBroadcastMutation("llm")).toBe(true);
  });

  it("stays silent for human + system sources", () => {
    // "human": browser is already current. "system": GET-hydration of a
    // just-opened file — broadcasting it fires a phantom "agent edited" toast.
    expect(shouldBroadcastMutation("human")).toBe(false);
    expect(shouldBroadcastMutation("system")).toBe(false);
  });
});

describe("studio — isSafePath", () => {
  it("accepts a plain relative name", () => {
    expect(isSafePath("foo.atelier")).toBe(true);
  });

  it("accepts a relative subfolder path", () => {
    expect(isSafePath("notes/x.atelier")).toBe(true);
  });

  it("accepts a name containing '..' that does not escape (my..backup)", () => {
    expect(isSafePath("my..backup.atelier")).toBe(true);
  });

  it("rejects empty + absolute inputs", () => {
    expect(isSafePath("")).toBe(false);
    expect(isSafePath("/etc/passwd")).toBe(false);
  });

  it("rejects a traversal that escapes cwd", () => {
    expect(isSafePath("../escape.atelier")).toBe(false);
    expect(isSafePath("../../escape.atelier")).toBe(false);
  });

  it("does NOT match a sibling-prefix directory escape", () => {
    // cwd is e.g. /a/proj; a resolved /a/proj-x must not pass the containment
    // check just because its path starts with cwd. We synthesize the input
    // relative to the real cwd's parent so it resolves to a sibling.
    const cwdName = resolve(process.cwd()).split("/").pop()!;
    expect(isSafePath(`../${cwdName}-sibling/x.atelier`)).toBe(false);
  });
});

describe("studio — writeFileEnsuringDir (POST /api/file subfolder create)", () => {
  it("creates missing parent dirs then writes the file", () => {
    const target = join(tmpDir, "sub", "dir", "new.atelier");
    expect(existsSync(dirname(target))).toBe(false);

    writeFileEnsuringDir(target, "hello-doc");

    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf-8")).toBe("hello-doc");
  });
});

// Fix 2: a doc:patch over the WS bridge for a subfolder doc must create the
// parent dirs (persistHumanPatch now uses writeFileEnsuringDir). This mirrors
// the wiring the studio command installs (store.onChange → persistHumanPatch),
// asserting it no longer ENOENTs on `notes/x.atelier`.
describe("studio — persistHumanPatch (WS bridge subfolder doc)", () => {
  it("creates parent dirs + writes when persisting a subfolder doc:patch", () => {
    const cwd = join(tmpDir, "bridge-persist");
    mkdirSync(cwd, { recursive: true });
    const docId = "notes/deep/x.atelier";
    const absPath = resolve(cwd, docId);
    expect(existsSync(dirname(absPath))).toBe(false);

    // Same body as persistHumanPatch: writeFileEnsuringDir(resolve(cwd,docId),...)
    const serialized = serializeAtelier(bridgeDoc("from-bridge"));
    writeFileEnsuringDir(absPath, serialized);

    expect(existsSync(absPath)).toBe(true);
    const parsed = parseAtelier(readFileSync(absPath, "utf-8"));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("from-bridge");
  });
});

// Fix 1 (BLOCKING): the autosave race that corrupted .atelier files. The
// SaveCoordinator is the extracted, tested implementation of the schedule /
// flush-on-switch logic the inline app uses. Editing A then switching to B
// inside the debounce window must NEVER write A's bytes to B's path, and must
// not silently drop A's unsaved edit.
describe("studio — SaveCoordinator (autosave race on fast file switch)", () => {
  // Manual fake timer so we control exactly when (and whether) a save fires.
  function makeHarness() {
    const writes: Array<{ path: string; content: string }> = [];
    const syncWrites: Array<{ path: string; content: string }> = [];
    let pendingTimer: (() => void) | null = null;
    const coord = new SaveCoordinator({
      save: (path, content) => { writes.push({ path, content }); },
      saveSync: (path, content) => { syncWrites.push({ path, content }); },
      delayMs: 800,
      setTimeoutFn: (fn) => { pendingTimer = fn; return 1 as unknown as ReturnType<typeof setTimeout>; },
      clearTimeoutFn: () => { pendingTimer = null; },
    });
    return {
      coord,
      writes,
      syncWrites,
      fireTimer: () => { const t = pendingTimer; pendingTimer = null; t?.(); },
      timerPending: () => pendingTimer !== null,
    };
  }

  it("does NOT write A's content to B when switching files mid-debounce", () => {
    const h = makeHarness();
    // Edit A — debounced save scheduled.
    h.coord.schedule("a.atelier", "CONTENT_A");
    expect(h.timerPending()).toBe(true);

    // Switch to B before the 800ms elapses: flush A, then schedule B.
    h.coord.flushPending();
    h.coord.schedule("b.atelier", "CONTENT_B");

    // A's unsaved edit was flushed to A's OWN path — not lost, not on B.
    expect(h.syncWrites).toEqual([{ path: "a.atelier", content: "CONTENT_A" }]);
    // The flush cancelled A's timer; only B's debounce remains pending.
    h.fireTimer();
    expect(h.writes).toEqual([{ path: "b.atelier", content: "CONTENT_B" }]);
    // CONTENT_A never landed on b.atelier (the corruption).
    expect(h.writes.find((w) => w.path === "b.atelier")?.content).not.toBe("CONTENT_A");
  });

  it("a fired debounce timer writes to the file it was scheduled for", () => {
    const h = makeHarness();
    h.coord.schedule("a.atelier", "CONTENT_A");
    h.fireTimer();
    expect(h.writes).toEqual([{ path: "a.atelier", content: "CONTENT_A" }]);
    expect(h.coord.hasPending()).toBe(false);
  });

  it("flushPending with no pending edit is a no-op", () => {
    const h = makeHarness();
    h.coord.flushPending();
    expect(h.syncWrites).toEqual([]);
    expect(h.writes).toEqual([]);
  });
});

describe("studio bridge — attachBridgeClient", () => {
  it("sends hello + doc:loaded on connect, then broadcasts store mutations as llm:mutation", () => {
    const state: BridgeSessionState = {
      store: new DocumentStore(),
      currentDocId: "session.atelier",
    };
    state.store.set("session.atelier", bridgeDoc("initial"), "system");

    const clients = new Set<any>();
    const ws = new FakeBridgeWs();
    attachBridgeClient(
      ws as any,
      state,
      clients as any,
      () => null,
      () => undefined,
    );

    const sent = ws.parsed() as Array<{ type: string }>;
    expect(sent.length).toBe(2);
    expect(sent[0].type).toBe("hello");
    expect((sent[0] as any).protocolVersion).toBe(1);
    expect(sent[1].type).toBe("doc:loaded");
    expect((sent[1] as any).documentId).toBe("session.atelier");
    expect((sent[1] as any).doc.name).toBe("initial");
    expect(clients.has(ws as any)).toBe(true);

    // Subscribe + broadcast: simulate an LLM mutation landing in the store.
    state.store.onChange((id, doc, source) => {
      if (!shouldBroadcastMutation(source) || !doc) return;
      broadcastToBridge(clients as any, {
        type: "llm:mutation",
        documentId: id,
        doc,
        source,
      });
    });

    state.store.set("session.atelier", bridgeDoc("after-llm"), "llm");

    const all = ws.parsed() as Array<{ type: string; doc?: any; source?: string }>;
    const mutation = all.find((e) => e.type === "llm:mutation");
    expect(mutation).toBeDefined();
    expect(mutation!.doc.name).toBe("after-llm");
    expect(mutation!.source).toBe("llm");
  });

  it("skips broadcasting human-sourced changes (no echo back to the browser)", () => {
    const state: BridgeSessionState = {
      store: new DocumentStore(),
      currentDocId: "session.atelier",
    };
    state.store.set("session.atelier", bridgeDoc("initial"), "system");

    const clients = new Set<any>();
    const ws = new FakeBridgeWs();
    attachBridgeClient(
      ws as any,
      state,
      clients as any,
      () => null,
      () => undefined,
    );

    // Drop the connect frames; we're only measuring the subscription effect.
    ws.sent = [];

    // Same broadcast wiring the studio command installs.
    state.store.onChange((id, doc, source) => {
      if (!shouldBroadcastMutation(source) || !doc) return;
      broadcastToBridge(clients as any, {
        type: "llm:mutation",
        documentId: id,
        doc,
        source,
      });
    });

    state.store.set("session.atelier", bridgeDoc("human-edit"), "human");
    expect(ws.sent).toEqual([]); // nothing broadcast

    // Regression: a "system" change is GET-hydration of a file the user just
    // opened — it must NOT broadcast (else a phantom "agent edited" toast fires
    // on a plain file-open).
    state.store.set("session.atelier", bridgeDoc("system-hydrate"), "system");
    expect(ws.sent).toEqual([]); // still nothing broadcast

    state.store.set("session.atelier", bridgeDoc("llm-edit"), "llm");
    expect(ws.sent.length).toBe(1); // only LLM passes through
  });

  it("ack flow: inbound doc:patch persists + writes store with source:human", () => {
    const state: BridgeSessionState = {
      store: new DocumentStore(),
      currentDocId: null,
    };
    const clients = new Set<any>();
    const persisted: Array<{ id: string; doc: AtelierDocument }> = [];
    const ws = new FakeBridgeWs();

    attachBridgeClient(
      ws as any,
      state,
      clients as any,
      () => null,
      (id, doc) => { persisted.push({ id, doc }); },
    );

    // Wire the broadcast subscription so we can assert no echo.
    let broadcasts = 0;
    state.store.onChange((_id, _doc, source) => {
      if (source !== "human") broadcasts += 1;
    });

    ws.sent = []; // drop hello/doc:loaded
    const newDoc = bridgeDoc("from-browser");
    ws.deliver(JSON.stringify({
      type: "doc:patch",
      documentId: "session.atelier",
      doc: newDoc,
      source: "human",
      opId: "op-1",
    }));

    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe("session.atelier");
    expect(persisted[0].doc.name).toBe("from-browser");
    expect(state.store.get("session.atelier")?.name).toBe("from-browser");
    expect(state.currentDocId).toBe("session.atelier");
    expect(broadcasts).toBe(0); // human-source mutation did NOT broadcast
    expect(ws.sent).toEqual([]); // and no ack-echo back to the originator
  });

  it("hydrates from disk when bridge client connects before browser loads any file", () => {
    const state: BridgeSessionState = {
      store: new DocumentStore(),
      currentDocId: "lazy.atelier",
    };
    const yaml = serializeAtelier(bridgeDoc("from-disk"));

    const ws = new FakeBridgeWs();
    attachBridgeClient(
      ws as any,
      state,
      new Set() as any,
      (id) => (id === "lazy.atelier" ? yaml : null),
      () => undefined,
    );

    const sent = ws.parsed() as Array<{ type: string; doc?: any }>;
    const loaded = sent.find((e) => e.type === "doc:loaded");
    expect(loaded).toBeDefined();
    expect(loaded!.doc.name).toBe("from-disk");
    // The store should now be hot for future MCP queries.
    expect(state.store.get("lazy.atelier")?.name).toBe("from-disk");
  });
});

// ─── Carousel (batch image → overlay'd PNG) Tests ────────────

describe("fitImageToCanvas (carousel aspect-fit)", () => {
  it("fits a landscape image to the canvas width", () => {
    const fit = fitImageToCanvas({ width: 1080, height: 1080 }, { width: 1920, height: 1080 });
    expect(fit.bounds.width).toBe(1080);
    expect(fit.bounds.height).toBeCloseTo(607.5, 1);
    expect(fit.frame).toEqual({ x: 540, y: 540 });
  });

  it("fits a portrait image to the canvas height", () => {
    const fit = fitImageToCanvas({ width: 1080, height: 1080 }, { width: 1080, height: 1920 });
    expect(fit.bounds.height).toBe(1080);
    expect(fit.bounds.width).toBeCloseTo(607.5, 1);
  });

  it("falls back to canvas extents for degenerate natural dims", () => {
    const fit = fitImageToCanvas({ width: 800, height: 600 }, { width: 0, height: 0 });
    expect(fit.bounds).toEqual({ width: 800, height: 600 });
    expect(fit.frame).toEqual({ x: 400, y: 300 });
  });
});

describe("carouselFileName", () => {
  it("zero-pads to at least 2 digits, sortable", () => {
    expect(carouselFileName(1, 3, "/in/foo.jpg")).toBe("01-foo.png");
    expect(carouselFileName(2, 3, "/in/bar.png")).toBe("02-bar.png");
  });

  it("widens the pad to the digit-count of N", () => {
    expect(carouselFileName(7, 120, "/in/shot.webp")).toBe("007-shot.png");
  });
});

describe("expandInputs", () => {
  let inDir: string;
  beforeAll(() => {
    inDir = join(tmpDir, "carousel-inputs");
    mkdirSync(inDir, { recursive: true });
    writeFileSync(join(inDir, "c.png"), "x");
    writeFileSync(join(inDir, "a.jpg"), "x");
    writeFileSync(join(inDir, "b.jpeg"), "x");
    writeFileSync(join(inDir, "notes.txt"), "x"); // filtered out
    writeFileSync(join(inDir, "img-1.webp"), "x");
  });

  it("lists image files in a directory, sorted, excluding non-images", () => {
    const out = expandInputs(inDir).map((p) => p.split("/").pop());
    expect(out).toEqual(["a.jpg", "b.jpeg", "c.png", "img-1.webp"]);
  });

  it("expands a single-segment *-glob in the final path component", () => {
    const out = expandInputs(join(inDir, "*.png")).map((p) => p.split("/").pop());
    expect(out).toEqual(["c.png"]);
  });

  it("matches a *-stem glob across extensions", () => {
    const out = expandInputs(join(inDir, "img-*")).map((p) => p.split("/").pop());
    expect(out).toEqual(["img-1.webp"]);
  });

  it("returns a single image for a literal file path", () => {
    const out = expandInputs(join(inDir, "a.jpg"));
    expect(out).toEqual([join(inDir, "a.jpg")]);
  });

  it("returns [] for an empty / non-image-only directory glob", () => {
    expect(expandInputs(join(inDir, "*.gif"))).toEqual([]);
  });
});

describe("composeCarouselFrameDoc", () => {
  const recipe: StudioRecipe = {
    version: "1.0",
    name: "carousel-style",
    overlay_rules: {
      handle: { text: "@kit", anchor: "bottom-left" },
      page_number: { format: "{current}/{total}", anchor: "top-right" },
    },
  };

  it("threads currentIndex/totalCount into the page-number overlay", () => {
    const doc = composeCarouselFrameDoc({
      imagePath: "/imgs/shot.png",
      index: 2,
      total: 5,
      width: 1080,
      height: 1080,
      recipe,
    });
    const page = doc.layers.find((l) => l.id === "overlay-page-number");
    expect(page).toBeDefined();
    expect((page!.visual as { content: string }).content).toBe("2/5");
  });

  it("emits a distinct i/N per frame across a batch", () => {
    const contents = [1, 2, 3].map((i) => {
      const doc = composeCarouselFrameDoc({
        imagePath: `/imgs/s${i}.png`,
        index: i,
        total: 3,
        width: 1080,
        height: 1080,
        recipe,
      });
      const page = doc.layers.find((l) => l.id === "overlay-page-number");
      return (page!.visual as { content: string }).content;
    });
    expect(contents).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("builds one fit-to-canvas image layer pointing at the source path", () => {
    const doc = composeCarouselFrameDoc({
      imagePath: "/imgs/shot.png",
      index: 1,
      total: 1,
      width: 1080,
      height: 1350,
      recipe,
    });
    expect(doc.canvas).toMatchObject({ width: 1080, height: 1350 });
    const img = doc.layers.find((l) => l.visual.type === "image");
    expect(img).toBeDefined();
    expect((img!.visual as { src: string }).src).toBe("/imgs/shot.png");
    expect(doc.states.default.duration).toBe(1);
  });

  it("applies the handle overlay too", () => {
    const doc = composeCarouselFrameDoc({
      imagePath: "/imgs/shot.png",
      index: 1,
      total: 1,
      width: 1080,
      height: 1080,
      recipe,
    });
    const handle = doc.layers.find((l) => l.id === "overlay-handle");
    expect((handle!.visual as { content: string }).content).toBe("@kit");
  });
});

/** Build a fresh commander program with only carousel registered. */
function makeCarouselProgram(): Command {
  const program = new Command();
  program.exitOverride();
  carouselCommand(program);
  return program;
}

/**
 * Run the carousel command, trapping process.exit so the runner survives.
 * Returns the captured exit code (undefined = no exit) and stderr text.
 */
async function runCarousel(argv: string[]): Promise<{ code?: number; stderr: string }> {
  const program = makeCarouselProgram();
  const origExit = process.exit;
  const origErr = console.error;
  const origLog = console.log;
  let exitCode: number | undefined;
  let stderr = "";
  (process.exit as unknown as (c?: number) => void) = ((c?: number) => {
    exitCode = c;
    throw new Error(`__exit_${c ?? 0}__`);
  }) as never;
  console.error = (msg?: unknown) => {
    stderr += String(msg) + "\n";
  };
  console.log = () => {};
  try {
    await program.parseAsync(["node", "atelier", "carousel", ...argv]);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith("__exit_")) {
      const cErr = err as { code?: string; exitCode?: number };
      if (cErr?.code === "commander.missingMandatoryOptionValue" || cErr?.code === "commander.missingArgument") {
        exitCode = cErr.exitCode ?? 1;
      } else if (!(err instanceof Error)) {
        throw err;
      }
    }
  } finally {
    process.exit = origExit;
    console.error = origErr;
    console.log = origLog;
  }
  return { code: exitCode, stderr };
}

describe("atelier carousel", () => {
  const recipeYaml = `version: "1.0"
name: "carousel-cmd"
overlay_rules:
  handle:
    text: "@kit"
    anchor: "bottom-left"
  page_number:
    format: "{current}/{total}"
    anchor: "top-right"
`;

  it("errors cleanly when the recipe cannot be resolved", async () => {
    const imgsDir = join(tmpDir, "carousel-cmd-missing-recipe");
    mkdirSync(imgsDir, { recursive: true });
    writeFileSync(join(imgsDir, "a.png"), "x");
    const { code, stderr } = await runCarousel([
      join(tmpDir, "does-not-exist.recipe.yaml"),
      "--inputs", imgsDir,
      "--out-dir", join(tmpDir, "carousel-cmd-missing-out"),
    ]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/recipe|not found/i);
  });

  it("errors cleanly when the input glob matches no images", async () => {
    const recipePath = writeTmpFile("carousel-empty.recipe.yaml", recipeYaml);
    const emptyDir = join(tmpDir, "carousel-empty-inputs");
    mkdirSync(emptyDir, { recursive: true });
    const { code, stderr } = await runCarousel([
      recipePath,
      "--inputs", join(emptyDir, "*.png"),
      "--out-dir", join(tmpDir, "carousel-empty-out"),
    ]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/no image files matched/i);
  });

  it(
    "writes a zero-padded sortable PNG per input image into the out-dir",
    async () => {
      const recipePath = writeTmpFile("carousel-render.recipe.yaml", recipeYaml);

      // Generate 3 real PNGs via @napi-rs/canvas so loadImage can decode them.
      const mod = await import("@napi-rs/canvas");
      const imgsDir = join(tmpDir, "carousel-render-inputs");
      mkdirSync(imgsDir, { recursive: true });
      for (const name of ["alpha", "bravo", "charlie"]) {
        const c = mod.createCanvas(200, 100);
        const cx = c.getContext("2d");
        cx.fillStyle = "#3366cc";
        cx.fillRect(0, 0, 200, 100);
        writeFileSync(join(imgsDir, `${name}.png`), c.toBuffer("image/png"));
      }

      const outDir = join(tmpDir, "carousel-render-out");
      const { code } = await runCarousel([
        recipePath,
        "--inputs", imgsDir,
        "--out-dir", outDir,
        "--width", "512",
        "--height", "512",
      ]);

      expect(code).toBeUndefined();
      const written = readdirSync(outDir).sort();
      expect(written).toEqual(["01-alpha.png", "02-bravo.png", "03-charlie.png"]);
      for (const f of written) {
        expect(isPng(join(outDir, f))).toBe(true);
        expect(readPngDimensions(join(outDir, f))).toEqual({ width: 512, height: 512 });
      }
    },
  );
});
