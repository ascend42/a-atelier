import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync as execFileSyncForTest } from "node:child_process";
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
import { runInit, isInsideGitRepo, parseModeAnswer, initCommand } from "./commands/init.js";
import {
  runReconstruct,
  reconstructCommand,
  type ReconstructResult,
} from "./commands/reconstruct.js";
import type { TranscribeResult } from "./commands/transcribe.js";
import {
  readLearningMode,
  writeLearningMode,
  learningModePath,
  renderLearningModeYaml,
  resolveLearningMode,
} from "./lib/learning-mode.js";
import {
  ACTIVE_PROJECT_FILENAME,
  activeProjectPath,
  clearActiveProject,
  createWorkspace,
  findWorkspace,
  isProjectDir,
  isValidProjectName,
  listProjects,
  readActiveProject,
  readWorkspace,
  setActiveProject,
  WORKSPACE_MANIFEST_FILENAME,
} from "./lib/workspace.js";
import {
  buildActiveProject,
  buildWorkspaceInfo,
  handleClearActiveProject,
  handleCreateProject,
  handleSetActiveProject,
  studioContext,
} from "./commands/studio.js";
import { createProjectInWorkspace } from "./commands/init.js";
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
    expect(args).toContain("rgba");
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
    // stats_mode=single makes a palette per frame; paletteuse must switch to
    // each one (new=1) or every frame is quantized to the first frame's palette.
    expect(args[args.indexOf("-vf") + 1]).toContain("paletteuse=new=1");
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

// ─── Artifacts command ─────────────────────────────────────────
// `atelier artifacts validate <project-dir>` — first user-facing
// surface over the Phase 2 front-of-pipeline artifact schemas.
// Reuses the runRecipe-style command harness pattern (cwd-pinned,
// stdout/stderr/exit captured).

import { artifactsCommand } from "./commands/artifacts.js";
import { loadArtifactsFromProject } from "./lib/artifact-project.js";

async function runArtifacts(
  argv: string[],
  cwd: string,
): Promise<{ code?: number; stdout: string; stderr: string }> {
  const program = new Command();
  program.exitOverride();
  artifactsCommand(program);

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
    await program.parseAsync(["node", "atelier", "artifacts", ...argv]);
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

/**
 * Locate the schema package's canonical artifact fixtures
 * (packages/schema/src/artifacts/__fixtures__/) so we can copy them
 * into a per-test tmp project dir. Copying (not symlinking) keeps the
 * test stable on CI runners that disallow symlinks.
 */
function schemaArtifactFixturesDir(): string {
  // packages/cli/src/index.test.ts → ../../schema/src/artifacts/__fixtures__
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "schema", "src", "artifacts", "__fixtures__");
}

function copyFixture(srcDir: string, dstDir: string, name: string): void {
  writeFileSync(join(dstDir, name), readFileSync(join(srcDir, name), "utf-8"), "utf-8");
}

describe("loadArtifactsFromProject", () => {
  it("loads all three artifacts when present (schema fixtures round-trip)", () => {
    const projectDir = join(tmpDir, "artifacts-load-all");
    mkdirSync(projectDir, { recursive: true });
    const fx = schemaArtifactFixturesDir();
    copyFixture(fx, projectDir, "DESIGN.md");
    copyFixture(fx, projectDir, "SCRIPT.md");
    copyFixture(fx, projectDir, "STORYBOARD.md");

    const loaded = loadArtifactsFromProject(projectDir);
    expect(loaded.parseErrors).toEqual([]);
    expect(loaded.missing).toEqual([]);
    expect(loaded.design).toBeDefined();
    expect(loaded.script).toBeDefined();
    expect(loaded.storyboard).toBeDefined();
  });

  it("reports missing files via `missing` (not as errors)", () => {
    const projectDir = join(tmpDir, "artifacts-load-partial");
    mkdirSync(projectDir, { recursive: true });
    const fx = schemaArtifactFixturesDir();
    copyFixture(fx, projectDir, "DESIGN.md");

    const loaded = loadArtifactsFromProject(projectDir);
    expect(loaded.design).toBeDefined();
    expect(loaded.script).toBeUndefined();
    expect(loaded.storyboard).toBeUndefined();
    expect(loaded.missing).toEqual(["SCRIPT.md", "STORYBOARD.md"]);
    expect(loaded.parseErrors).toEqual([]);
  });

  it("captures per-file parse errors without aborting the rest", () => {
    const projectDir = join(tmpDir, "artifacts-load-bad-design");
    mkdirSync(projectDir, { recursive: true });
    const fx = schemaArtifactFixturesDir();
    // Bad DESIGN — frontmatter that won't satisfy the schema.
    writeFileSync(
      join(projectDir, "DESIGN.md"),
      "---\naudience: not-a-mapping\n---\n",
      "utf-8",
    );
    copyFixture(fx, projectDir, "SCRIPT.md");
    copyFixture(fx, projectDir, "STORYBOARD.md");

    const loaded = loadArtifactsFromProject(projectDir);
    expect(loaded.parseErrors.length).toBe(1);
    expect(loaded.parseErrors[0].artifact).toBe("design");
    expect(loaded.design).toBeUndefined();
    expect(loaded.script).toBeDefined();
    expect(loaded.storyboard).toBeDefined();
  });

  it("throws when the project-dir does not exist", () => {
    expect(() => loadArtifactsFromProject(join(tmpDir, "nope-does-not-exist")))
      .toThrow(/does not exist/);
  });
});

describe("atelier artifacts validate (CLI)", () => {
  it("exits 0 and prints PASS when all three valid fixtures are present", async () => {
    const projectDir = join(tmpDir, "artifacts-cli-all-ok");
    mkdirSync(projectDir, { recursive: true });
    const fx = schemaArtifactFixturesDir();
    copyFixture(fx, projectDir, "DESIGN.md");
    copyFixture(fx, projectDir, "SCRIPT.md");
    copyFixture(fx, projectDir, "STORYBOARD.md");

    const res = await runArtifacts(["validate", projectDir], projectDir);
    expect(res.code).toBeUndefined(); // no exit → success
    expect(res.stdout).toMatch(/DESIGN\.md\s+OK/);
    expect(res.stdout).toMatch(/SCRIPT\.md\s+OK/);
    expect(res.stdout).toMatch(/STORYBOARD\.md\s+OK/);
    expect(res.stdout).toMatch(/Result: PASS/);
  });

  it("exits 0 and notes [not present] when only DESIGN.md is on disk", async () => {
    const projectDir = join(tmpDir, "artifacts-cli-only-design");
    mkdirSync(projectDir, { recursive: true });
    const fx = schemaArtifactFixturesDir();
    copyFixture(fx, projectDir, "DESIGN.md");

    const res = await runArtifacts(["validate", projectDir], projectDir);
    expect(res.code).toBeUndefined();
    expect(res.stdout).toMatch(/DESIGN\.md\s+OK/);
    expect(res.stdout).toMatch(/SCRIPT\.md\s+\[not present\]/);
    expect(res.stdout).toMatch(/STORYBOARD\.md\s+\[not present\]/);
    expect(res.stdout).toMatch(/Result: PASS/);
  });

  it("exits 1 when STORYBOARD references a beat id that is not in SCRIPT", async () => {
    const projectDir = join(tmpDir, "artifacts-cli-bad-beat");
    mkdirSync(projectDir, { recursive: true });
    const fx = schemaArtifactFixturesDir();
    copyFixture(fx, projectDir, "DESIGN.md");
    copyFixture(fx, projectDir, "SCRIPT.md");
    // Inject a STORYBOARD with a beat id that has no SCRIPT counterpart.
    writeFileSync(
      join(projectDir, "STORYBOARD.md"),
      `---
technique_library_version: 1
aspect_ratio: "9:16"
---

## not-a-script-beat
window: { start_s: 0.0, end_s: 2.0 }
mood: [clinical]
camera: { kind: static }
slots:
  - text.super.from-script
techniques:
  - text.split-reveal
transition_out: { kind: cut }
`,
      "utf-8",
    );

    const res = await runArtifacts(["validate", projectDir], projectDir);
    expect(res.code).toBe(1);
    expect(res.stdout).toMatch(/Result: FAIL/);
    expect(res.stdout).toMatch(/not-a-script-beat/);
    expect(res.stdout).toMatch(/no matching SCRIPT beat/);
  });

  it("--json emits parseable JSON with ok flag and validation block", async () => {
    const projectDir = join(tmpDir, "artifacts-cli-json");
    mkdirSync(projectDir, { recursive: true });
    const fx = schemaArtifactFixturesDir();
    copyFixture(fx, projectDir, "DESIGN.md");
    copyFixture(fx, projectDir, "SCRIPT.md");
    copyFixture(fx, projectDir, "STORYBOARD.md");

    const res = await runArtifacts(["validate", projectDir, "--json"], projectDir);
    expect(res.code).toBeUndefined();
    const parsed = JSON.parse(res.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.present).toEqual({ design: true, script: true, storyboard: true });
    expect(parsed.missing).toEqual([]);
    expect(parsed.parseErrors).toEqual([]);
    expect(parsed.validation.ok).toBe(true);
    expect(parsed.validation.errors).toEqual([]);
  });

  it("--json reports ok:false and emits the errors array on a bad beat id", async () => {
    const projectDir = join(tmpDir, "artifacts-cli-json-fail");
    mkdirSync(projectDir, { recursive: true });
    const fx = schemaArtifactFixturesDir();
    copyFixture(fx, projectDir, "SCRIPT.md");
    writeFileSync(
      join(projectDir, "STORYBOARD.md"),
      `---
technique_library_version: 1
aspect_ratio: "9:16"
---

## ghost-beat
window: { start_s: 0.0, end_s: 2.0 }
mood: [clinical]
camera: { kind: static }
slots:
  - text.super.from-script
techniques:
  - text.split-reveal
transition_out: { kind: cut }
`,
      "utf-8",
    );

    const res = await runArtifacts(["validate", projectDir, "--json"], projectDir);
    expect(res.code).toBe(1);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.validation.ok).toBe(false);
    expect(parsed.validation.errors.some((e: string) => e.includes("ghost-beat"))).toBe(true);
  });

  it("exits 1 on a missing project-dir with a clear message", async () => {
    const missing = join(tmpDir, "artifacts-cli-missing-dir");
    const res = await runArtifacts(["validate", missing], tmpDir);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/does not exist/);
  });
});

// ─── Artifacts scaffold ─────────────────────────────────────────
// `atelier artifacts scaffold <project-dir>` — write canonical empty
// DESIGN.md / SCRIPT.md / STORYBOARD.md templates so a creator can
// start authoring then validate with the sibling `validate` verb.

import {
  ARTIFACT_TEMPLATES,
  ARTIFACT_SLOTS,
} from "./lib/artifact-templates.js";
import {
  parseDesign,
  parseScript,
  parseStoryboard,
  validateArtifactSet,
} from "@a-company/atelier-schema";

describe("artifact-templates self-validate", () => {
  // Direct schema-level check that the shipped template strings parse and
  // cross-validate clean — the load-bearing invariant the templates exist
  // to honor (artifact-templates-self-validate aspect).

  it("DESIGN_TEMPLATE parses cleanly via parseDesign", () => {
    const design = parseDesign(ARTIFACT_TEMPLATES.design.content);
    expect(design.audience.primary).toBeTruthy();
    expect(design.voice.descriptors.length).toBeGreaterThanOrEqual(3);
    expect(design.visual_register.palette.length).toBeGreaterThanOrEqual(1);
  });

  it("SCRIPT_TEMPLATE parses cleanly via parseScript and is narrated mode", () => {
    const script = parseScript(ARTIFACT_TEMPLATES.script.content);
    expect(script.mode).toBe("narrated");
    if (script.mode !== "narrated") return; // type guard
    expect(script.blocks.hook.length).toBeGreaterThanOrEqual(1);
    expect(script.blocks.hook[0].id).toBe("hook-1");
    expect(script.blocks.cta[0].id).toBe("cta-1");
  });

  it("STORYBOARD_TEMPLATE parses cleanly via parseStoryboard with matching beat ids", () => {
    const sb = parseStoryboard(ARTIFACT_TEMPLATES.storyboard.content);
    const ids = sb.beats.map((b) => b.id);
    expect(ids).toContain("hook-1");
    expect(ids).toContain("cta-1");
  });

  it("the triple validateArtifactSet's clean (ok:true, no errors)", () => {
    const design = parseDesign(ARTIFACT_TEMPLATES.design.content);
    const script = parseScript(ARTIFACT_TEMPLATES.script.content);
    const storyboard = parseStoryboard(ARTIFACT_TEMPLATES.storyboard.content);
    const result = validateArtifactSet({ design, script, storyboard });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("atelier artifacts scaffold (CLI)", () => {
  it("writes all three templates into a freshly created project dir", async () => {
    // Note: dir does NOT exist yet — scaffold should mkdir it.
    const projectDir = join(tmpDir, "artifacts-scaffold-fresh");
    const res = await runArtifacts(["scaffold", projectDir], tmpDir);
    expect(res.code).toBeUndefined();
    expect(existsSync(projectDir)).toBe(true);
    for (const slot of ARTIFACT_SLOTS) {
      const f = join(projectDir, ARTIFACT_TEMPLATES[slot].filename);
      expect(existsSync(f)).toBe(true);
    }
    // The freshly-written triple must validate clean via the schema-level
    // validator — this is the contract that closes the author loop.
    const design = parseDesign(readFileSync(join(projectDir, "DESIGN.md"), "utf-8"));
    const script = parseScript(readFileSync(join(projectDir, "SCRIPT.md"), "utf-8"));
    const storyboard = parseStoryboard(readFileSync(join(projectDir, "STORYBOARD.md"), "utf-8"));
    const v = validateArtifactSet({ design, script, storyboard });
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("--only design writes only DESIGN.md", async () => {
    const projectDir = join(tmpDir, "artifacts-scaffold-only-design");
    mkdirSync(projectDir, { recursive: true });
    const res = await runArtifacts(["scaffold", projectDir, "--only", "design"], tmpDir);
    expect(res.code).toBeUndefined();
    expect(existsSync(join(projectDir, "DESIGN.md"))).toBe(true);
    expect(existsSync(join(projectDir, "SCRIPT.md"))).toBe(false);
    expect(existsSync(join(projectDir, "STORYBOARD.md"))).toBe(false);
  });

  it("--only design,storyboard writes both via comma-split", async () => {
    const projectDir = join(tmpDir, "artifacts-scaffold-only-pair");
    mkdirSync(projectDir, { recursive: true });
    const res = await runArtifacts(
      ["scaffold", projectDir, "--only", "design,storyboard"],
      tmpDir,
    );
    expect(res.code).toBeUndefined();
    expect(existsSync(join(projectDir, "DESIGN.md"))).toBe(true);
    expect(existsSync(join(projectDir, "SCRIPT.md"))).toBe(false);
    expect(existsSync(join(projectDir, "STORYBOARD.md"))).toBe(true);
  });

  it("refuses to overwrite existing files without --force (exit 1, files unchanged)", async () => {
    const projectDir = join(tmpDir, "artifacts-scaffold-no-force");
    mkdirSync(projectDir, { recursive: true });
    const original = "ORIGINAL CONTENT — must survive a non-force scaffold.\n";
    writeFileSync(join(projectDir, "DESIGN.md"), original, "utf-8");

    const res = await runArtifacts(["scaffold", projectDir], tmpDir);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/refusing to overwrite/);
    // Existing file untouched.
    expect(readFileSync(join(projectDir, "DESIGN.md"), "utf-8")).toBe(original);
    // The other two slots also must NOT have been written — the pre-flight
    // overwrite check aborts the whole op atomically (advisor's point: list
    // every clobber, write none).
    expect(existsSync(join(projectDir, "SCRIPT.md"))).toBe(false);
    expect(existsSync(join(projectDir, "STORYBOARD.md"))).toBe(false);
  });

  it("--force overwrites existing files", async () => {
    const projectDir = join(tmpDir, "artifacts-scaffold-force");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "DESIGN.md"), "OLD\n", "utf-8");

    const res = await runArtifacts(["scaffold", projectDir, "--force"], tmpDir);
    expect(res.code).toBeUndefined();
    // The new file is the template — verify by parsing it.
    const design = parseDesign(readFileSync(join(projectDir, "DESIGN.md"), "utf-8"));
    expect(design.audience).toBeDefined();
  });

  it("exits 1 when project-dir is a file rather than a directory", async () => {
    const filePath = join(tmpDir, "artifacts-scaffold-is-file.txt");
    writeFileSync(filePath, "not a dir\n", "utf-8");
    const res = await runArtifacts(["scaffold", filePath], tmpDir);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/not a directory/);
  });

  it("--json emits { ok, created, skipped } on success", async () => {
    const projectDir = join(tmpDir, "artifacts-scaffold-json");
    const res = await runArtifacts(["scaffold", projectDir, "--json"], tmpDir);
    expect(res.code).toBeUndefined();
    const parsed = JSON.parse(res.stdout);
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.created)).toBe(true);
    expect(parsed.created.length).toBe(3);
    expect(parsed.skipped).toEqual([]);
  });

  it("rejects unknown --only tokens with a clear message", async () => {
    const projectDir = join(tmpDir, "artifacts-scaffold-bad-only");
    const res = await runArtifacts(["scaffold", projectDir, "--only", "nope"], tmpDir);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/unknown --only value/);
  });
});

// ─── learning-mode I/O ─────────────────────────────────────────────
// Round-trip checks for the tiny YAML shape that `atelier init` writes.

describe("learning-mode I/O", () => {
  it("writeLearningMode → readLearningMode round-trips ambient", () => {
    const dir = join(tmpDir, "learning-mode-ambient");
    mkdirSync(dir, { recursive: true });
    const path = writeLearningMode(dir, "ambient", {
      chosenAt: new Date("2026-05-26T12:00:00.000Z"),
    });
    expect(path).toBe(learningModePath(dir));
    const loaded = readLearningMode(dir);
    expect(loaded?.mode).toBe("ambient");
    expect(loaded?.chosen_at).toBe("2026-05-26T12:00:00.000Z");
    expect(loaded?.version).toBe("1.0");
  });

  it("readLearningMode returns undefined when the file is absent", () => {
    const dir = join(tmpDir, "learning-mode-absent");
    mkdirSync(dir, { recursive: true });
    expect(readLearningMode(dir)).toBeUndefined();
  });

  it("readLearningMode throws on an invalid mode value", () => {
    const dir = join(tmpDir, "learning-mode-bad-mode");
    mkdirSync(join(dir, ".atelier"), { recursive: true });
    writeFileSync(
      learningModePath(dir),
      renderLearningModeYaml({
        version: "1.0",
        mode: "wat" as never,
        chosen_at: "2026-05-26T00:00:00.000Z",
      }),
      "utf-8",
    );
    expect(() => readLearningMode(dir)).toThrow(/invalid mode/);
  });
});

// ─── atelier init (CLI + runInit) ──────────────────────────────────
// The top-level first-run setup — picks learning mode, writes
// .atelier/learning-mode.yaml, creates the mind-map dir, scaffolds the
// three artifacts, optionally git inits. Tests drive `runInit` directly
// (no readline) and the Commander wrapper for one end-to-end smoke.

function detectGit(): boolean {
  try {
    execFileSyncForTest("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function runInitViaCli(
  argv: string[],
  cwd: string,
): Promise<{ code?: number; stdout: string; stderr: string }> {
  const program = new Command();
  program.exitOverride();
  initCommand(program);

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
    await program.parseAsync(["node", "atelier", "init", ...argv]);
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

describe("parseModeAnswer", () => {
  it("accepts 1 / 2 / ambient / explicit, case-insensitive", () => {
    expect(parseModeAnswer("1")).toBe("ambient");
    expect(parseModeAnswer("2")).toBe("explicit");
    expect(parseModeAnswer("ambient")).toBe("ambient");
    expect(parseModeAnswer("AMBIENT")).toBe("ambient");
    expect(parseModeAnswer(" explicit ")).toBe("explicit");
  });

  it("returns undefined for anything else", () => {
    expect(parseModeAnswer("")).toBeUndefined();
    expect(parseModeAnswer("yes")).toBeUndefined();
    expect(parseModeAnswer("3")).toBeUndefined();
  });
});

describe("atelier init (runInit)", () => {
  it("writes learning-mode + mind-map + artifacts in a fresh dir (ambient, --no-git)", async () => {
    const dir = join(tmpDir, "init-fresh-ambient");
    const res = await runInit({
      projectDir: dir,
      mode: "ambient",
      git: false,
      scaffold: true,
      force: false,
      json: false,
    });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("ambient");
    expect(existsSync(dir)).toBe(true);
    // learning-mode.yaml
    expect(existsSync(res.learningModeFile)).toBe(true);
    const lm = readLearningMode(dir);
    expect(lm?.mode).toBe("ambient");
    // mind-map dir + README
    expect(existsSync(res.mindMapDir)).toBe(true);
    expect(existsSync(join(res.mindMapDir, "README.md"))).toBe(true);
    // Artifacts
    expect(existsSync(join(dir, "DESIGN.md"))).toBe(true);
    expect(existsSync(join(dir, "SCRIPT.md"))).toBe(true);
    expect(existsSync(join(dir, "STORYBOARD.md"))).toBe(true);
    expect(res.scaffolded.length).toBe(3);
    expect(res.gitInitialized).toBe(false);
    expect(res.alreadyInRepo).toBe(false);
  });

  it("--mode explicit lands mode=explicit on disk", async () => {
    const dir = join(tmpDir, "init-explicit");
    const res = await runInit({
      projectDir: dir,
      mode: "explicit",
      git: false,
      scaffold: true,
      force: false,
      json: false,
    });
    expect(res.mode).toBe("explicit");
    expect(readLearningMode(dir)?.mode).toBe("explicit");
  });

  it("--no-scaffold skips DESIGN/SCRIPT/STORYBOARD but still writes learning-mode + mind-map", async () => {
    const dir = join(tmpDir, "init-no-scaffold");
    const res = await runInit({
      projectDir: dir,
      mode: "ambient",
      git: false,
      scaffold: false,
      force: false,
      json: false,
    });
    expect(res.scaffolded).toEqual([]);
    expect(existsSync(join(dir, "DESIGN.md"))).toBe(false);
    expect(existsSync(join(dir, "SCRIPT.md"))).toBe(false);
    expect(existsSync(join(dir, "STORYBOARD.md"))).toBe(false);
    expect(existsSync(res.learningModeFile)).toBe(true);
    expect(existsSync(join(res.mindMapDir, "README.md"))).toBe(true);
  });

  it("exits with a file-not-dir error when project-dir is a file", async () => {
    const filePath = join(tmpDir, "init-not-a-dir.txt");
    writeFileSync(filePath, "not a dir\n", "utf-8");
    await expect(
      runInit({
        projectDir: filePath,
        mode: "ambient",
        git: false,
        scaffold: false,
        force: false,
        json: false,
      }),
    ).rejects.toThrow(/not a directory/);
  });

  it("rejects bad --mode before any fs writes", async () => {
    const dir = join(tmpDir, "init-bad-mode");
    await expect(
      runInit({
        projectDir: dir,
        mode: "loose",
        git: false,
        scaffold: false,
        force: false,
        json: false,
      }),
    ).rejects.toThrow(/invalid --mode/);
    // Critically: NO directory was created — validation runs first.
    expect(existsSync(dir)).toBe(false);
  });

  it("re-running init on an already-initialized dir succeeds (idempotent)", async () => {
    const dir = join(tmpDir, "init-rerun");
    // First pass.
    const r1 = await runInit({
      projectDir: dir,
      mode: "ambient",
      git: false,
      scaffold: true,
      force: false,
      json: false,
    });
    expect(r1.scaffolded.length).toBe(3);
    const firstReadme = readFileSync(join(r1.mindMapDir, "README.md"), "utf-8");
    const firstTimestamp = readLearningMode(dir)!.chosen_at;
    // Hand-edit the README — should survive the re-init.
    const editedReadme = "# CUSTOM README\nDo not clobber.\n";
    writeFileSync(join(r1.mindMapDir, "README.md"), editedReadme, "utf-8");
    // Hand-edit DESIGN.md — refuse-to-overwrite path means it survives too.
    writeFileSync(join(dir, "DESIGN.md"), "EDITED\n", "utf-8");

    // Force a different timestamp on re-run.
    await new Promise((r) => setTimeout(r, 10));
    const r2 = await runInit({
      projectDir: dir,
      mode: "explicit",
      git: false,
      scaffold: true,
      force: false,
      json: false,
    });
    expect(r2.ok).toBe(true);
    expect(r2.mode).toBe("explicit");
    // learning-mode was refreshed with the new mode + a new timestamp.
    const secondTimestamp = readLearningMode(dir)!.chosen_at;
    expect(secondTimestamp).not.toBe(firstTimestamp);
    expect(readLearningMode(dir)?.mode).toBe("explicit");
    // Mind-map README survives.
    expect(readFileSync(join(r2.mindMapDir, "README.md"), "utf-8")).toBe(editedReadme);
    // DESIGN.md edit survives — scaffold step was a soft-skip.
    expect(readFileSync(join(dir, "DESIGN.md"), "utf-8")).toBe("EDITED\n");
    expect(r2.scaffolded).toEqual([]);
    expect(r2.notes.some((n) => /artifacts already present/i.test(n))).toBe(true);
    // unused — keeps the assignment from being flagged as dead.
    expect(firstReadme.length).toBeGreaterThan(0);
  });

  it("CLI --json emits the documented payload shape", async () => {
    const dir = join(tmpDir, "init-json");
    const res = await runInitViaCli(
      [dir, "--mode", "ambient", "--no-git", "--json"],
      tmpDir,
    );
    expect(res.code).toBeUndefined();
    const parsed = JSON.parse(res.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.projectDir).toBe(resolve(dir));
    expect(parsed.mode).toBe("ambient");
    expect(parsed.learningModeFile).toBe(resolve(dir, ".atelier/learning-mode.yaml"));
    expect(parsed.mindMapDir).toBe(resolve(dir, ".atelier/mind-map"));
    expect(Array.isArray(parsed.scaffolded)).toBe(true);
    expect(parsed.scaffolded.length).toBe(3);
    expect(parsed.gitInitialized).toBe(false);
    expect(parsed.alreadyInRepo).toBe(false);
  });

  it("CLI exits 1 on bad --mode and reports the error", async () => {
    const dir = join(tmpDir, "init-cli-bad-mode");
    const res = await runInitViaCli([dir, "--mode", "loose", "--no-git"], tmpDir);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/invalid --mode/);
    expect(existsSync(dir)).toBe(false);
  });

  it("CLI exits 1 when --json is set without --mode (no-prompt scripted invariant)", async () => {
    const dir = join(tmpDir, "init-cli-json-no-mode");
    const res = await runInitViaCli([dir, "--json", "--no-git", "--no-scaffold"], tmpDir);
    expect(res.code).toBe(1);
  });

  it.runIf(detectGit())(
    "runs `git init` in a fresh dir when --no-git is absent (gated on system git)",
    async () => {
      const dir = join(tmpDir, "init-git");
      const res = await runInit({
        projectDir: dir,
        mode: "ambient",
        git: true,
        scaffold: false,
        force: false,
        json: false,
      });
      expect(res.gitInitialized).toBe(true);
      expect(res.alreadyInRepo).toBe(false);
      expect(existsSync(join(dir, ".git"))).toBe(true);
      expect(existsSync(join(dir, ".gitignore"))).toBe(true);
      // Re-running detects "already in repo" instead of re-initing.
      const res2 = await runInit({
        projectDir: dir,
        mode: "ambient",
        git: true,
        scaffold: false,
        force: false,
        json: false,
      });
      expect(res2.gitInitialized).toBe(false);
      expect(res2.alreadyInRepo).toBe(true);
      expect(isInsideGitRepo(dir)).toBe(true);
    },
  );
});

// ─── Workspace IO ───────────────────────────────────────────────────
// Tests for createWorkspace + findWorkspace + listProjects + read/write +
// resolveLearningMode + studioContext. Workspace is the post-core-build
// ergonomics layer — a directory holding multiple Projects + shared
// creator-level state.

describe("createWorkspace", () => {
  it("creates workspace.atelier + .atelier/ tree with learning-mode + mind-map + recipes", () => {
    const dir = join(tmpDir, "ws-create-fresh");
    const { manifest } = createWorkspace(dir, {
      mode: "ambient",
      createdAt: new Date("2026-05-26T12:00:00.000Z"),
    });
    expect(manifest.version).toBe("1.0");
    expect(manifest.default_mode).toBe("ambient");
    expect(manifest.name).toBe("ws-create-fresh");
    expect(manifest.created).toBe("2026-05-26T12:00:00.000Z");
    // Files on disk.
    expect(existsSync(join(dir, WORKSPACE_MANIFEST_FILENAME))).toBe(true);
    expect(existsSync(join(dir, ".atelier", "learning-mode.yaml"))).toBe(true);
    expect(existsSync(join(dir, ".atelier", "mind-map"))).toBe(true);
    expect(existsSync(join(dir, ".atelier", "mind-map", "README.md"))).toBe(true);
    expect(existsSync(join(dir, ".atelier", "recipes"))).toBe(true);
    // Manifest round-trips via reader.
    const read = readWorkspace(dir);
    expect(read.name).toBe(manifest.name);
    expect(read.default_mode).toBe("ambient");
  });

  it("honors name + description options", () => {
    const dir = join(tmpDir, "ws-create-named");
    const { manifest } = createWorkspace(dir, {
      mode: "explicit",
      name: "Pretty Name",
      description: "a creator studio",
    });
    expect(manifest.name).toBe("Pretty Name");
    expect(manifest.description).toBe("a creator studio");
    const read = readWorkspace(dir);
    expect(read.name).toBe("Pretty Name");
    expect(read.description).toBe("a creator studio");
  });

  it("refuses to overwrite an existing workspace without force", () => {
    const dir = join(tmpDir, "ws-create-no-clobber");
    createWorkspace(dir, { mode: "ambient" });
    expect(() => createWorkspace(dir, { mode: "explicit" })).toThrow(/refusing to overwrite/);
  });

  it("force overwrites an existing workspace", () => {
    const dir = join(tmpDir, "ws-create-forced");
    createWorkspace(dir, { mode: "ambient" });
    const { manifest: m2 } = createWorkspace(dir, { mode: "explicit", force: true });
    expect(m2.default_mode).toBe("explicit");
    expect(readWorkspace(dir).default_mode).toBe("explicit");
  });
});

describe("findWorkspace", () => {
  it("returns null when no workspace.atelier is found up to the filesystem root", () => {
    // Use a deeply-nested fresh tmp dir that we know has no workspace
    // anywhere above it (tmpdir-based testing).
    const dir = join(tmpDir, "ws-find-none", "deep", "deeper");
    mkdirSync(dir, { recursive: true });
    const found = findWorkspace(dir);
    expect(found).toBeNull();
  });

  it("finds a workspace from a deeply-nested cwd", () => {
    const wsDir = join(tmpDir, "ws-find-deep");
    createWorkspace(wsDir, { mode: "ambient" });
    const nested = join(wsDir, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    const found = findWorkspace(nested);
    expect(found).not.toBeNull();
    expect(found?.workspaceDir).toBe(resolve(wsDir));
    expect(found?.manifest.name).toBe("ws-find-deep");
  });

  it("finds the workspace from the workspace root itself", () => {
    const wsDir = join(tmpDir, "ws-find-root");
    createWorkspace(wsDir, { mode: "ambient" });
    const found = findWorkspace(wsDir);
    expect(found?.workspaceDir).toBe(resolve(wsDir));
  });
});

describe("listProjects", () => {
  it("returns sorted basenames of dirs containing project.atelier", () => {
    const wsDir = join(tmpDir, "ws-list-projects");
    createWorkspace(wsDir, { mode: "ambient" });
    mkdirSync(join(wsDir, "beta-clip"), { recursive: true });
    writeFileSync(join(wsDir, "beta-clip", "project.atelier"), "{}\n", "utf-8");
    mkdirSync(join(wsDir, "alpha-clip"), { recursive: true });
    writeFileSync(join(wsDir, "alpha-clip", "project.atelier"), "{}\n", "utf-8");
    // A bare dir without project.atelier — should NOT show up.
    mkdirSync(join(wsDir, "scratch"), { recursive: true });
    const projects = listProjects(wsDir);
    expect(projects).toEqual(["alpha-clip", "beta-clip"]);
  });

  it("returns an empty list when the workspace has no projects", () => {
    const wsDir = join(tmpDir, "ws-list-empty");
    createWorkspace(wsDir, { mode: "ambient" });
    expect(listProjects(wsDir)).toEqual([]);
  });
});

describe("isProjectDir", () => {
  it("is true iff project.atelier exists at the dir root", () => {
    const dir = join(tmpDir, "is-project");
    mkdirSync(dir, { recursive: true });
    expect(isProjectDir(dir)).toBe(false);
    writeFileSync(join(dir, "project.atelier"), "{}\n", "utf-8");
    expect(isProjectDir(dir)).toBe(true);
  });
});

describe("resolveLearningMode", () => {
  it("returns source=default + ambient when no workspace and no project", () => {
    const dir = join(tmpDir, "resolve-mode-default");
    mkdirSync(dir, { recursive: true });
    const r = resolveLearningMode(dir);
    expect(r.mode).toBe("ambient");
    expect(r.source).toBe("default");
  });

  it("returns source=workspace from the workspace's .atelier/learning-mode.yaml", () => {
    const wsDir = join(tmpDir, "resolve-mode-ws");
    createWorkspace(wsDir, { mode: "explicit" });
    expect(resolveLearningMode(wsDir).source).toBe("workspace");
    expect(resolveLearningMode(wsDir).mode).toBe("explicit");
    // Nested cwd also resolves to workspace mode.
    const nested = join(wsDir, "a-project");
    mkdirSync(nested, { recursive: true });
    const r = resolveLearningMode(nested);
    expect(r.source).toBe("workspace");
    expect(r.mode).toBe("explicit");
  });

  it("returns source=project when cwd is in a project dir outside any workspace", () => {
    const projDir = join(tmpDir, "resolve-mode-project");
    mkdirSync(projDir, { recursive: true });
    writeLearningMode(projDir, "explicit");
    const r = resolveLearningMode(projDir);
    expect(r.source).toBe("project");
    expect(r.mode).toBe("explicit");
  });
});

describe("studioContext", () => {
  it("returns kind=empty for a fresh dir outside any workspace or project", () => {
    const dir = join(tmpDir, "studio-ctx-empty");
    mkdirSync(dir, { recursive: true });
    const ctx = studioContext(dir);
    expect(ctx.kind).toBe("empty");
  });

  it("returns kind=workspace at a workspace root", () => {
    const wsDir = join(tmpDir, "studio-ctx-ws");
    createWorkspace(wsDir, { mode: "ambient" });
    const ctx = studioContext(wsDir);
    expect(ctx.kind).toBe("workspace");
    expect(ctx.workspaceDir).toBe(resolve(wsDir));
    expect(ctx.projects).toEqual([]);
  });

  it("returns kind=project when cwd is a project subdir of a workspace", () => {
    const wsDir = join(tmpDir, "studio-ctx-ws-proj");
    createWorkspace(wsDir, { mode: "ambient" });
    const projDir = join(wsDir, "clip-1");
    mkdirSync(projDir, { recursive: true });
    writeFileSync(join(projDir, "project.atelier"), "{}\n", "utf-8");
    const ctx = studioContext(projDir);
    expect(ctx.kind).toBe("project");
    expect(ctx.projectDir).toBe(resolve(projDir));
    expect(ctx.workspaceDir).toBe(resolve(wsDir));
  });

  it("returns kind=project for a standalone project (legacy, no workspace)", () => {
    const projDir = join(tmpDir, "studio-ctx-legacy-proj");
    mkdirSync(projDir, { recursive: true });
    writeFileSync(join(projDir, "project.atelier"), "{}\n", "utf-8");
    const ctx = studioContext(projDir);
    expect(ctx.kind).toBe("project");
    expect(ctx.projectDir).toBe(resolve(projDir));
    expect(ctx.workspaceDir).toBeUndefined();
  });

  it("returns kind=workspace with the project list when projects exist", () => {
    const wsDir = join(tmpDir, "studio-ctx-ws-multi");
    createWorkspace(wsDir, { mode: "ambient" });
    mkdirSync(join(wsDir, "p1"), { recursive: true });
    writeFileSync(join(wsDir, "p1", "project.atelier"), "{}\n", "utf-8");
    mkdirSync(join(wsDir, "p2"), { recursive: true });
    writeFileSync(join(wsDir, "p2", "project.atelier"), "{}\n", "utf-8");
    const ctx = studioContext(wsDir);
    expect(ctx.kind).toBe("workspace");
    expect(ctx.projects).toEqual(["p1", "p2"]);
  });
});

// ─── atelier init inside a workspace ────────────────────────────────
// The wrapper does workspace-relative path resolution AND mode inheritance
// when cwd is inside a workspace. runInit itself is workspace-unaware;
// we drive the Commander wrapper for these tests.

describe("atelier init (workspace-aware via CLI)", () => {
  it("resolves <project-dir> relative to the workspace root when cwd is inside the workspace", async () => {
    const wsDir = join(tmpDir, "init-ws-relative");
    createWorkspace(wsDir, { mode: "explicit" });
    const nested = join(wsDir, "scratch");
    mkdirSync(nested, { recursive: true });
    // Provide --mode so the prompt isn't reached; relative path should
    // resolve under wsDir, not under nested cwd.
    const res = await runInitViaCli(
      ["my-clip", "--mode", "ambient", "--no-git", "--no-scaffold"],
      nested,
    );
    expect(res.code).toBeUndefined();
    expect(existsSync(join(wsDir, "my-clip"))).toBe(true);
    expect(existsSync(join(nested, "my-clip"))).toBe(false);
    expect(existsSync(join(wsDir, "my-clip", ".atelier", "learning-mode.yaml"))).toBe(true);
  });

  it("--no-workspace-relative resolves relative to cwd instead of workspace root", async () => {
    const wsDir = join(tmpDir, "init-ws-relative-opt-out");
    createWorkspace(wsDir, { mode: "ambient" });
    const nested = join(wsDir, "scratch2");
    mkdirSync(nested, { recursive: true });
    const res = await runInitViaCli(
      ["other-clip", "--mode", "ambient", "--no-git", "--no-scaffold", "--no-workspace-relative"],
      nested,
    );
    expect(res.code).toBeUndefined();
    expect(existsSync(join(nested, "other-clip"))).toBe(true);
    expect(existsSync(join(wsDir, "other-clip"))).toBe(false);
  });

  it("inherits the workspace's default_mode when --mode is absent", async () => {
    const wsDir = join(tmpDir, "init-ws-inherit-mode");
    createWorkspace(wsDir, { mode: "explicit" });
    // No --mode flag — wrapper should inherit explicit from workspace.
    const res = await runInitViaCli(
      ["clip-a", "--no-git", "--no-scaffold", "--json"],
      wsDir,
    );
    expect(res.code).toBeUndefined();
    const payload = JSON.parse(res.stdout);
    expect(payload.mode).toBe("explicit");
    expect(payload.projectDir).toBe(resolve(join(wsDir, "clip-a")));
    // Inheritance note surfaced.
    expect(payload.notes.some((n: string) => /inherited from workspace/i.test(n))).toBe(true);
  });

  it("refreshes the workspace manifest's projects[] from on-disk truth after init", async () => {
    const wsDir = join(tmpDir, "init-ws-manifest-refresh");
    createWorkspace(wsDir, { mode: "ambient" });
    // Pre-seed a project (project.atelier is the manifest's discovery
    // signal; atelier init doesn't drop one itself today). After running
    // init on a NEW project, the manifest's projects[] should reflect the
    // pre-existing one — i.e. the refresh ran.
    mkdirSync(join(wsDir, "pre-existing"), { recursive: true });
    writeFileSync(join(wsDir, "pre-existing", "project.atelier"), "{}\n", "utf-8");
    const res = await runInitViaCli(
      ["new-clip", "--no-git", "--no-scaffold"],
      wsDir,
    );
    expect(res.code).toBeUndefined();
    const m = readWorkspace(wsDir);
    expect(m.projects ?? []).toContain("pre-existing");
  });

  it("explicit --mode wins over the workspace's default_mode", async () => {
    const wsDir = join(tmpDir, "init-ws-explicit-override");
    createWorkspace(wsDir, { mode: "ambient" });
    const res = await runInitViaCli(
      ["override-clip", "--mode", "explicit", "--no-git", "--no-scaffold", "--json"],
      wsDir,
    );
    expect(res.code).toBeUndefined();
    const payload = JSON.parse(res.stdout);
    expect(payload.mode).toBe("explicit");
    // Inheritance note absent — creator explicitly chose.
    expect(payload.notes.some((n: string) => /inherited from workspace/i.test(n))).toBe(false);
  });

  it("outside a workspace, --mode is still required for --json (current behavior unchanged)", async () => {
    const dir = join(tmpDir, "init-outside-ws-json");
    mkdirSync(dir, { recursive: true });
    // No workspace anywhere above tmpDir.
    const res = await runInitViaCli(
      ["clip", "--json", "--no-git", "--no-scaffold"],
      dir,
    );
    expect(res.code).toBe(1);
  });
});

// ─── Phase 1: workspace-level active project ────────────────────────
//
// Active-project IO is the file-source-of-truth for "which Project does
// a workspace-scoped operation target". Both the studio UI and the agent
// team read + write the same file (no in-memory state to drift from).
// These tests exercise the pure helpers AND the HTTP endpoint handlers
// (the handlers are extracted as pure functions so we don't need to boot
// a Vite dev server to verify them).

describe("isValidProjectName", () => {
  it("accepts single-segment alphanumeric / dash / underscore names", () => {
    expect(isValidProjectName("clip-1")).toBe(true);
    expect(isValidProjectName("clip_1")).toBe(true);
    expect(isValidProjectName("ClipA")).toBe(true);
    expect(isValidProjectName("my-project.draft")).toBe(true); // trailing-dot segment OK
  });

  it("rejects empty / whitespace / non-string", () => {
    expect(isValidProjectName("")).toBe(false);
    expect(isValidProjectName(" ")).toBe(false);
    expect(isValidProjectName("  foo  ")).toBe(false);
    expect(isValidProjectName(undefined)).toBe(false);
    expect(isValidProjectName(null)).toBe(false);
    expect(isValidProjectName(42)).toBe(false);
  });

  it("rejects path separators in either direction", () => {
    expect(isValidProjectName("a/b")).toBe(false);
    expect(isValidProjectName("a\\b")).toBe(false);
    expect(isValidProjectName("../escape")).toBe(false);
  });

  it("rejects leading-dot names (dotdirs reserved for .atelier etc.)", () => {
    expect(isValidProjectName(".hidden")).toBe(false);
    expect(isValidProjectName(".")).toBe(false);
    expect(isValidProjectName("..")).toBe(false);
  });
});

describe("active-project IO (read / set / clear)", () => {
  it("readActiveProject returns null when the file is missing", () => {
    const wsDir = join(tmpDir, "active-missing");
    createWorkspace(wsDir, { mode: "ambient" });
    expect(readActiveProject(wsDir)).toBeNull();
  });

  it("setActiveProject + readActiveProject round-trip", () => {
    const wsDir = join(tmpDir, "active-roundtrip");
    createWorkspace(wsDir, { mode: "ambient" });
    // Seed a project so the existence-check passes.
    mkdirSync(join(wsDir, "clip-1"), { recursive: true });
    writeFileSync(join(wsDir, "clip-1", "project.atelier"), "{}\n", "utf-8");

    const setAt = new Date("2026-05-27T10:00:00.000Z");
    const written = setActiveProject(wsDir, "clip-1", { setAt });
    expect(written.name).toBe("clip-1");
    expect(written.set_at).toBe("2026-05-27T10:00:00.000Z");

    // File on disk at the canonical path.
    const path = activeProjectPath(wsDir);
    expect(path).toBe(join(resolve(wsDir), ".atelier", ACTIVE_PROJECT_FILENAME));
    expect(existsSync(path)).toBe(true);

    const read = readActiveProject(wsDir);
    expect(read).not.toBeNull();
    expect(read!.name).toBe("clip-1");
    expect(read!.set_at).toBe("2026-05-27T10:00:00.000Z");
  });

  it("setActiveProject throws when the named project doesn't exist", () => {
    const wsDir = join(tmpDir, "active-no-project");
    createWorkspace(wsDir, { mode: "ambient" });
    expect(() => setActiveProject(wsDir, "missing")).toThrow(/does not exist/);
  });

  it("setActiveProject throws on an invalid name BEFORE any path join", () => {
    const wsDir = join(tmpDir, "active-bad-name");
    createWorkspace(wsDir, { mode: "ambient" });
    expect(() => setActiveProject(wsDir, "../escape")).toThrow(/invalid project name/);
    expect(() => setActiveProject(wsDir, ".hidden")).toThrow(/invalid project name/);
    expect(() => setActiveProject(wsDir, "")).toThrow(/invalid project name/);
  });

  it("readActiveProject returns null for a malformed file (missing required fields)", () => {
    const wsDir = join(tmpDir, "active-malformed");
    createWorkspace(wsDir, { mode: "ambient" });
    // Hand-write a broken pointer — no `name` field.
    const path = activeProjectPath(wsDir);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `version: '1.0'\nset_at: '2026-05-27T10:00:00.000Z'\n`, "utf-8");
    expect(readActiveProject(wsDir)).toBeNull();
  });

  it("readActiveProject still returns the entry when the pointed-at project no longer exists (stale)", () => {
    const wsDir = join(tmpDir, "active-stale");
    createWorkspace(wsDir, { mode: "ambient" });
    // Seed + point at a project, then delete it from disk.
    mkdirSync(join(wsDir, "ghost"), { recursive: true });
    writeFileSync(join(wsDir, "ghost", "project.atelier"), "{}\n", "utf-8");
    setActiveProject(wsDir, "ghost");
    rmSync(join(wsDir, "ghost"), { recursive: true, force: true });

    // The pure read still returns the entry — staleness detection lives
    // at the HTTP endpoint layer (separate concern).
    const read = readActiveProject(wsDir);
    expect(read).not.toBeNull();
    expect(read!.name).toBe("ghost");
  });

  it("clearActiveProject removes the file when present", () => {
    const wsDir = join(tmpDir, "active-clear-present");
    createWorkspace(wsDir, { mode: "ambient" });
    mkdirSync(join(wsDir, "clip"), { recursive: true });
    writeFileSync(join(wsDir, "clip", "project.atelier"), "{}\n", "utf-8");
    setActiveProject(wsDir, "clip");
    expect(existsSync(activeProjectPath(wsDir))).toBe(true);
    expect(clearActiveProject(wsDir)).toBe(true);
    expect(existsSync(activeProjectPath(wsDir))).toBe(false);
  });

  it("clearActiveProject is a no-op when the file is absent", () => {
    const wsDir = join(tmpDir, "active-clear-absent");
    createWorkspace(wsDir, { mode: "ambient" });
    expect(clearActiveProject(wsDir)).toBe(false);
  });
});

describe("buildWorkspaceInfo (GET /api/workspace)", () => {
  it("returns 404 when cwd is outside any workspace", () => {
    const dir = join(tmpDir, "ws-info-empty", "deep");
    mkdirSync(dir, { recursive: true });
    const r = buildWorkspaceInfo(dir);
    expect(r.status).toBe(404);
  });

  it("returns workspace info + projects[] with feature flags", () => {
    const wsDir = join(tmpDir, "ws-info-populated");
    createWorkspace(wsDir, { mode: "ambient", name: "ws-info" });
    mkdirSync(join(wsDir, "clip-a"), { recursive: true });
    writeFileSync(join(wsDir, "clip-a", "project.atelier"), "{}\n", "utf-8");
    writeFileSync(join(wsDir, "clip-a", "DESIGN.md"), "# d\n", "utf-8");
    // Add a sibling .atelier doc so hasOtherAtelierDocs flips true.
    writeFileSync(join(wsDir, "clip-a", "scene.atelier"), "x\n", "utf-8");

    const r = buildWorkspaceInfo(wsDir);
    expect(r.status).toBe(200);
    const body = r.body as { name: string; default_mode: string; workspaceDir: string; projects: Array<Record<string, unknown>> };
    expect(body.name).toBe("ws-info");
    expect(body.default_mode).toBe("ambient");
    expect(body.workspaceDir).toBe(resolve(wsDir));
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe("clip-a");
    expect(body.projects[0].hasAtelierDoc).toBe(true);
    expect(body.projects[0].hasDesign).toBe(true);
    expect(body.projects[0].hasScript).toBe(false);
    expect(body.projects[0].hasStoryboard).toBe(false);
    expect(body.projects[0].hasOtherAtelierDocs).toBe(true);
  });
});

describe("buildActiveProject (GET /api/workspace/active)", () => {
  it("returns 404 outside a workspace", () => {
    const dir = join(tmpDir, "active-info-empty", "deep");
    mkdirSync(dir, { recursive: true });
    expect(buildActiveProject(dir).status).toBe(404);
  });

  it("returns null body when no active.yaml exists", () => {
    const wsDir = join(tmpDir, "active-info-none");
    createWorkspace(wsDir, { mode: "ambient" });
    const r = buildActiveProject(wsDir);
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
  });

  it("returns the entry when set and project still exists", () => {
    const wsDir = join(tmpDir, "active-info-fresh");
    createWorkspace(wsDir, { mode: "ambient" });
    mkdirSync(join(wsDir, "p"), { recursive: true });
    writeFileSync(join(wsDir, "p", "project.atelier"), "{}\n", "utf-8");
    setActiveProject(wsDir, "p");
    const r = buildActiveProject(wsDir);
    expect(r.status).toBe(200);
    const body = r.body as { name: string; stale?: boolean };
    expect(body.name).toBe("p");
    expect(body.stale).toBeUndefined();
  });

  it("marks the entry stale when the project has been deleted", () => {
    const wsDir = join(tmpDir, "active-info-stale");
    createWorkspace(wsDir, { mode: "ambient" });
    mkdirSync(join(wsDir, "doomed"), { recursive: true });
    writeFileSync(join(wsDir, "doomed", "project.atelier"), "{}\n", "utf-8");
    setActiveProject(wsDir, "doomed");
    rmSync(join(wsDir, "doomed"), { recursive: true, force: true });
    const r = buildActiveProject(wsDir);
    expect(r.status).toBe(200);
    const body = r.body as { name: string; stale?: boolean };
    expect(body.name).toBe("doomed");
    expect(body.stale).toBe(true);
  });
});

describe("handleSetActiveProject (POST /api/workspace/active)", () => {
  it("400s on invalid name", () => {
    const wsDir = join(tmpDir, "active-set-bad-name");
    createWorkspace(wsDir, { mode: "ambient" });
    const r = handleSetActiveProject(wsDir, { name: "../escape" });
    expect(r.status).toBe(400);
  });

  it("400s when the project doesn't exist", () => {
    const wsDir = join(tmpDir, "active-set-missing");
    createWorkspace(wsDir, { mode: "ambient" });
    const r = handleSetActiveProject(wsDir, { name: "ghost" });
    expect(r.status).toBe(400);
    const body = r.body as { error: string };
    expect(body.error).toMatch(/does not exist/);
  });

  it("200s and persists the pointer on a valid name + extant project", () => {
    const wsDir = join(tmpDir, "active-set-ok");
    createWorkspace(wsDir, { mode: "ambient" });
    mkdirSync(join(wsDir, "p"), { recursive: true });
    writeFileSync(join(wsDir, "p", "project.atelier"), "{}\n", "utf-8");
    const r = handleSetActiveProject(wsDir, { name: "p" });
    expect(r.status).toBe(200);
    expect(readActiveProject(wsDir)?.name).toBe("p");
  });
});

describe("handleClearActiveProject (DELETE /api/workspace/active)", () => {
  it("returns ok=true regardless of whether a file was actually removed", () => {
    const wsDir = join(tmpDir, "active-clear");
    createWorkspace(wsDir, { mode: "ambient" });
    // First clear — nothing to remove.
    let r = handleClearActiveProject(wsDir);
    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean; removed: boolean }).ok).toBe(true);
    expect((r.body as { removed: boolean }).removed).toBe(false);
    // Now seed + set + clear.
    mkdirSync(join(wsDir, "p"), { recursive: true });
    writeFileSync(join(wsDir, "p", "project.atelier"), "{}\n", "utf-8");
    setActiveProject(wsDir, "p");
    r = handleClearActiveProject(wsDir);
    expect((r.body as { removed: boolean }).removed).toBe(true);
    expect(existsSync(activeProjectPath(wsDir))).toBe(false);
  });
});

describe("handleCreateProject (POST /api/workspace/projects)", () => {
  it("400s on invalid name", async () => {
    const wsDir = join(tmpDir, "create-bad-name");
    createWorkspace(wsDir, { mode: "ambient" });
    const r = await handleCreateProject(wsDir, { name: "../escape" });
    expect(r.status).toBe(400);
  });

  it("400s on invalid mode", async () => {
    const wsDir = join(tmpDir, "create-bad-mode");
    createWorkspace(wsDir, { mode: "ambient" });
    const r = await handleCreateProject(wsDir, { name: "ok", mode: "nope" });
    expect(r.status).toBe(400);
  });

  it("creates a project (in-process, no subprocess) and returns 201 with the entry", async () => {
    const wsDir = join(tmpDir, "create-ok");
    createWorkspace(wsDir, { mode: "ambient" });
    const r = await handleCreateProject(wsDir, { name: "new-clip" });
    expect(r.status).toBe(201);
    const body = r.body as { project: { name: string; hasDesign: boolean; hasScript: boolean; hasStoryboard: boolean }; active: unknown };
    expect(body.project.name).toBe("new-clip");
    // Scaffolded by default — DESIGN/SCRIPT/STORYBOARD should be present.
    expect(body.project.hasDesign).toBe(true);
    expect(body.project.hasScript).toBe(true);
    expect(body.project.hasStoryboard).toBe(true);
    // active.yaml NOT set unless activate: true.
    expect(body.active).toBeNull();
    expect(readActiveProject(wsDir)).toBeNull();
  });

  it("activates the new project when { activate: true }", async () => {
    const wsDir = join(tmpDir, "create-activate");
    createWorkspace(wsDir, { mode: "ambient" });
    const r = await handleCreateProject(wsDir, { name: "auto-active", activate: true });
    expect(r.status).toBe(201);
    const body = r.body as { active: { name: string } | null };
    expect(body.active?.name).toBe("auto-active");
    expect(readActiveProject(wsDir)?.name).toBe("auto-active");
  });

  it("400s when a project with the same name already exists", async () => {
    const wsDir = join(tmpDir, "create-dup");
    createWorkspace(wsDir, { mode: "ambient" });
    mkdirSync(join(wsDir, "dup"), { recursive: true });
    writeFileSync(join(wsDir, "dup", "project.atelier"), "{}\n", "utf-8");
    const r = await handleCreateProject(wsDir, { name: "dup" });
    expect(r.status).toBe(400);
  });

  it("refreshes the workspace manifest's projects[] after creation", async () => {
    const wsDir = join(tmpDir, "create-refresh-manifest");
    createWorkspace(wsDir, { mode: "ambient" });
    await handleCreateProject(wsDir, { name: "fresh" });
    const m = readWorkspace(wsDir);
    expect(m.projects ?? []).toContain("fresh");
  });
});

describe("createProjectInWorkspace (direct lib export)", () => {
  it("rejects an invalid name before any fs work", async () => {
    const wsDir = join(tmpDir, "cp-bad-name");
    createWorkspace(wsDir, { mode: "ambient" });
    await expect(
      createProjectInWorkspace(wsDir, { name: "../escape" }),
    ).rejects.toThrow(/invalid project name/);
  });

  it("inherits the workspace default_mode when mode is omitted", async () => {
    const wsDir = join(tmpDir, "cp-inherit");
    createWorkspace(wsDir, { mode: "explicit" });
    const result = await createProjectInWorkspace(wsDir, { name: "inh", scaffold: false });
    expect(result.mode).toBe("explicit");
    expect(result.notes.some((n) => /inherited from workspace/i.test(n))).toBe(true);
  });
});

// ─── Paradigm + Atelier symbiosis ───────────────────────────────────────
// Detection + four idempotent augmentations (CLAUDE.md sentinel section,
// .claude/agents/ drop, .mcp.json merge, .paradigm/personas/index.yaml
// merge). The contract is: Atelier never touches anything Paradigm owns
// outside its sentinel-bracketed / namespaced surface; every augmentation
// is replay-safe.

import {
  augmentClaudeAgents,
  augmentClaudeMd,
  augmentMcpJson,
  augmentParadigmWithAtelier,
  augmentPersonasIndex,
  ATELIER_CLAUDE_MD_SECTION_BEGIN,
  ATELIER_CLAUDE_MD_SECTION_END,
  buildAtelierClaudeMdSection,
  detectParadigm,
} from "./lib/paradigm-augment.js";
import { ATELIER_AGENT_TEMPLATES } from "./lib/atelier-agent-templates.js";

/**
 * Write the minimum on-disk shape a `paradigm shift` would have produced:
 * CLAUDE.md, .mcp.json (with the paradigm server + permissions block),
 * .paradigm/config.yaml, .paradigm/personas/index.yaml. Returns the absolute
 * directory path.
 */
function fakeParadigmShifted(rootDir: string, opts: {
  withPersonasSibling?: boolean;
  withExistingPersona?: boolean;
} = {}): string {
  mkdirSync(rootDir, { recursive: true });
  writeFileSync(
    join(rootDir, "CLAUDE.md"),
    `# ${rootDir} - Claude Context\n\n> Paradigm v2.0\n\n## Paradigm preamble\n\nThis is the paradigm-owned preamble. Atelier must never touch it.\n`,
    "utf-8",
  );
  writeFileSync(
    join(rootDir, ".mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          paradigm: {
            command: "paradigm-mcp",
            args: ["."],
            cwd: rootDir,
          },
        },
        permissions: {
          allow: ["Bash(paradigm *)"],
        },
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  mkdirSync(join(rootDir, ".paradigm"), { recursive: true });
  writeFileSync(join(rootDir, ".paradigm", "config.yaml"), `version: '1.0'\n`, "utf-8");

  mkdirSync(join(rootDir, ".paradigm", "personas"), { recursive: true });
  const personasLines: string[] = [
    `version: '1.0'`,
    `generated: '2026-05-27T00:00:00.000Z'`,
  ];
  if (opts.withExistingPersona) {
    personasLines.push(`personas:`);
    personasLines.push(`  custom-author:`);
    personasLines.push(`    name: Custom`);
    personasLines.push(`    role: Author`);
  } else if (opts.withPersonasSibling) {
    personasLines.push(`personas: {}`);
  } else {
    personasLines.push(`personas: {}`);
  }
  personasLines.push(`chains: {}`);
  personasLines.push(`gate_coverage: {}`);
  personasLines.push(`route_coverage: {}`);
  personasLines.push(`uncovered_routes: []`);
  writeFileSync(
    join(rootDir, ".paradigm", "personas", "index.yaml"),
    personasLines.join("\n") + "\n",
    "utf-8",
  );
  return rootDir;
}

describe("detectParadigm", () => {
  it("returns present=true when both CLAUDE.md and .paradigm/config.yaml exist", () => {
    const dir = join(tmpDir, "detect-present");
    fakeParadigmShifted(dir);
    const det = detectParadigm(dir);
    expect(det.present).toBe(true);
    expect(det.claudeMdPath).toBe(join(resolve(dir), "CLAUDE.md"));
    expect(det.mcpJsonPath).toBe(join(resolve(dir), ".mcp.json"));
    expect(det.configYamlPath).toBe(join(resolve(dir), ".paradigm", "config.yaml"));
    expect(det.personasIndexPath).toBe(join(resolve(dir), ".paradigm", "personas", "index.yaml"));
    expect(det.agentsDirPath).toBe(join(resolve(dir), ".claude", "agents"));
  });

  it("returns present=false when CLAUDE.md exists but no .paradigm/config.yaml", () => {
    const dir = join(tmpDir, "detect-no-config");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "CLAUDE.md"), "x", "utf-8");
    expect(detectParadigm(dir).present).toBe(false);
  });

  it("returns present=false when .paradigm/config.yaml exists but no CLAUDE.md", () => {
    const dir = join(tmpDir, "detect-no-claudemd");
    mkdirSync(join(dir, ".paradigm"), { recursive: true });
    writeFileSync(join(dir, ".paradigm", "config.yaml"), "x", "utf-8");
    expect(detectParadigm(dir).present).toBe(false);
  });

  it("returns present=false for an empty dir", () => {
    const dir = join(tmpDir, "detect-empty");
    mkdirSync(dir, { recursive: true });
    expect(detectParadigm(dir).present).toBe(false);
  });
});

describe("augmentClaudeMd", () => {
  it("appends the section when no sentinels are present", () => {
    const dir = join(tmpDir, "claudemd-append");
    mkdirSync(dir, { recursive: true });
    const cmPath = join(dir, "CLAUDE.md");
    writeFileSync(cmPath, "# Paradigm preamble\n\nhello.\n", "utf-8");
    const section = buildAtelierClaudeMdSection({ workspaceName: "w", learningMode: "ambient" });
    const r = augmentClaudeMd(cmPath, section);
    expect(r.action).toBe("appended");
    const raw = readFileSync(cmPath, "utf-8");
    expect(raw).toContain("# Paradigm preamble");
    expect(raw).toContain(ATELIER_CLAUDE_MD_SECTION_BEGIN);
    expect(raw).toContain(ATELIER_CLAUDE_MD_SECTION_END);
    expect(raw).toContain("## Atelier Creator Workspace");
  });

  it("replaces the section on re-run (idempotent)", () => {
    const dir = join(tmpDir, "claudemd-replace");
    mkdirSync(dir, { recursive: true });
    const cmPath = join(dir, "CLAUDE.md");
    writeFileSync(cmPath, "# preamble\n", "utf-8");
    const s1 = buildAtelierClaudeMdSection({ workspaceName: "w1", learningMode: "ambient" });
    expect(augmentClaudeMd(cmPath, s1).action).toBe("appended");
    const s2 = buildAtelierClaudeMdSection({ workspaceName: "w2", learningMode: "explicit" });
    const r = augmentClaudeMd(cmPath, s2);
    expect(r.action).toBe("replaced");
    const raw = readFileSync(cmPath, "utf-8");
    // Only ONE pair of sentinels in the file after replacement.
    const openCount = (raw.match(new RegExp(ATELIER_CLAUDE_MD_SECTION_BEGIN.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g")) || []).length;
    expect(openCount).toBe(1);
    expect(raw).toContain("`w2`");
    expect(raw).toContain("**explicit**");
    expect(raw).not.toContain("`w1`");
    // Preamble still intact.
    expect(raw).toContain("# preamble");
  });

  it("preserves bytes outside the sentinels byte-for-byte", () => {
    const dir = join(tmpDir, "claudemd-preserve");
    mkdirSync(dir, { recursive: true });
    const cmPath = join(dir, "CLAUDE.md");
    const before = "# preamble line\n\nbody body body\n";
    const after = "\n\n## trailing paradigm section\n\nmore body.\n";
    const section = buildAtelierClaudeMdSection({ workspaceName: "w", learningMode: "ambient" });
    writeFileSync(cmPath, before + section + "\n" + after, "utf-8");
    // Replace with a different section; trailing content must survive.
    const s2 = buildAtelierClaudeMdSection({ workspaceName: "w2", learningMode: "explicit" });
    augmentClaudeMd(cmPath, s2);
    const raw = readFileSync(cmPath, "utf-8");
    expect(raw.startsWith(before)).toBe(true);
    expect(raw.endsWith(after)).toBe(true);
  });

  it("throws when the file is absent", () => {
    expect(() => augmentClaudeMd(join(tmpDir, "nope.md"), "x")).toThrow(/does not exist/);
  });
});

describe("augmentMcpJson", () => {
  it("adds the atelier server without disturbing paradigm or permissions", () => {
    const dir = join(tmpDir, "mcp-add");
    fakeParadigmShifted(dir);
    const r = augmentMcpJson(join(dir, ".mcp.json"), { atelierMcpCwd: dir });
    expect(r.action).toBe("added");
    const parsed = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"));
    expect(parsed.mcpServers.paradigm).toEqual({
      command: "paradigm-mcp",
      args: ["."],
      cwd: dir,
    });
    expect(parsed.mcpServers.atelier).toEqual({
      command: "atelier-mcp",
      args: ["."],
      cwd: dir,
    });
    expect(parsed.permissions).toEqual({ allow: ["Bash(paradigm *)"] });
  });

  it("returns skipped on a no-op re-run", () => {
    const dir = join(tmpDir, "mcp-skip");
    fakeParadigmShifted(dir);
    augmentMcpJson(join(dir, ".mcp.json"), { atelierMcpCwd: dir });
    const r = augmentMcpJson(join(dir, ".mcp.json"), { atelierMcpCwd: dir });
    expect(r.action).toBe("skipped");
  });

  it("returns updated when cwd changes", () => {
    const dir = join(tmpDir, "mcp-update");
    fakeParadigmShifted(dir);
    augmentMcpJson(join(dir, ".mcp.json"), { atelierMcpCwd: dir });
    const r = augmentMcpJson(join(dir, ".mcp.json"), { atelierMcpCwd: "/elsewhere" });
    expect(r.action).toBe("updated");
    const parsed = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"));
    expect(parsed.mcpServers.atelier.cwd).toBe("/elsewhere");
    // Paradigm + permissions still intact.
    expect(parsed.mcpServers.paradigm.command).toBe("paradigm-mcp");
    expect(parsed.permissions.allow).toEqual(["Bash(paradigm *)"]);
  });

  it("throws when the file is absent", () => {
    expect(() => augmentMcpJson(join(tmpDir, "nope.json"), {})).toThrow(/does not exist/);
  });
});

describe("augmentPersonasIndex", () => {
  it("adds Quill / Lux / Iris entries to an empty personas map", () => {
    const dir = join(tmpDir, "personas-empty");
    fakeParadigmShifted(dir);
    const r = augmentPersonasIndex(join(dir, ".paradigm", "personas", "index.yaml"));
    expect(r.action).toBe("added");
    expect(r.added.sort()).toEqual(["iris-composer", "lux-cinematographer", "quill-showrunner"]);
    const raw = readFileSync(join(dir, ".paradigm", "personas", "index.yaml"), "utf-8");
    expect(raw).toContain("quill-showrunner:");
    expect(raw).toContain("lux-cinematographer:");
    expect(raw).toContain("iris-composer:");
    // Sibling top-level keys preserved.
    expect(raw).toContain("chains:");
    expect(raw).toContain("gate_coverage:");
    expect(raw).toContain("uncovered_routes:");
    expect(raw).toContain("ships_with: a-atelier");
  });

  it("preserves a pre-existing custom persona and adds ours alongside", () => {
    const dir = join(tmpDir, "personas-coexist");
    fakeParadigmShifted(dir, { withExistingPersona: true });
    const r = augmentPersonasIndex(join(dir, ".paradigm", "personas", "index.yaml"));
    expect(r.action).toBe("added");
    expect(r.added).toContain("quill-showrunner");
    const raw = readFileSync(join(dir, ".paradigm", "personas", "index.yaml"), "utf-8");
    expect(raw).toContain("custom-author:");
    expect(raw).toContain("quill-showrunner:");
    expect(raw).toContain("lux-cinematographer:");
    expect(raw).toContain("iris-composer:");
  });

  it("is idempotent: a second pass returns skipped (no added ids)", () => {
    const dir = join(tmpDir, "personas-idem");
    fakeParadigmShifted(dir);
    augmentPersonasIndex(join(dir, ".paradigm", "personas", "index.yaml"));
    const r = augmentPersonasIndex(join(dir, ".paradigm", "personas", "index.yaml"));
    expect(r.added).toEqual([]);
    expect(r.action).toBe("skipped");
  });

  it("creates the file when missing entirely", () => {
    const dir = join(tmpDir, "personas-missing");
    mkdirSync(join(dir, ".paradigm", "personas"), { recursive: true });
    const path = join(dir, ".paradigm", "personas", "index.yaml");
    const r = augmentPersonasIndex(path);
    expect(r.action).toBe("added");
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf-8");
    expect(raw).toContain("quill-showrunner:");
  });
});

describe("augmentClaudeAgents", () => {
  it("creates the agents dir and writes all three files when absent", () => {
    const dir = join(tmpDir, "agents-fresh");
    mkdirSync(dir, { recursive: true });
    const agentsDir = join(dir, ".claude", "agents");
    const r = augmentClaudeAgents(agentsDir);
    expect(r.added.sort()).toEqual(["atelier-iris.md", "atelier-lux.md", "atelier-quill.md"]);
    expect(r.updated).toEqual([]);
    for (const f of Object.keys(ATELIER_AGENT_TEMPLATES)) {
      expect(existsSync(join(agentsDir, f))).toBe(true);
    }
    // Content matches the embedded snapshot.
    expect(readFileSync(join(agentsDir, "atelier-quill.md"), "utf-8"))
      .toBe(ATELIER_AGENT_TEMPLATES["atelier-quill.md"]);
  });

  it("overwrites existing files on re-run (canonical sync)", () => {
    const dir = join(tmpDir, "agents-overwrite");
    const agentsDir = join(dir, ".claude", "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, "atelier-quill.md"), "stale\n", "utf-8");
    const r = augmentClaudeAgents(agentsDir);
    expect(r.added.sort()).toEqual(["atelier-iris.md", "atelier-lux.md"]);
    expect(r.updated).toEqual(["atelier-quill.md"]);
    expect(readFileSync(join(agentsDir, "atelier-quill.md"), "utf-8")).not.toBe("stale\n");
    expect(readFileSync(join(agentsDir, "atelier-quill.md"), "utf-8"))
      .toBe(ATELIER_AGENT_TEMPLATES["atelier-quill.md"]);
  });
});

describe("augmentParadigmWithAtelier (integration)", () => {
  it("runs all four augmentations when paradigm is present", () => {
    const dir = join(tmpDir, "augment-integration");
    fakeParadigmShifted(dir);
    const r = augmentParadigmWithAtelier(dir, {
      workspaceName: "integration-ws",
      learningMode: "explicit",
    });
    expect(r.claudeMd.action).toBe("appended");
    expect(r.mcpJson.action).toBe("added");
    expect(r.personas.action).toBe("added");
    expect(r.agents.added.length).toBe(3);
    // All four sites carry the expected content.
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf-8")).toContain("`integration-ws`");
    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"));
    expect(mcp.mcpServers.paradigm).toBeDefined();
    expect(mcp.mcpServers.atelier).toBeDefined();
    expect(readFileSync(join(dir, ".paradigm", "personas", "index.yaml"), "utf-8"))
      .toContain("quill-showrunner:");
    expect(existsSync(join(dir, ".claude", "agents", "atelier-quill.md"))).toBe(true);
  });

  it("is idempotent across two runs", () => {
    const dir = join(tmpDir, "augment-idem");
    fakeParadigmShifted(dir);
    augmentParadigmWithAtelier(dir, {
      workspaceName: "w",
      learningMode: "ambient",
    });
    const r2 = augmentParadigmWithAtelier(dir, {
      workspaceName: "w",
      learningMode: "ambient",
    });
    expect(r2.claudeMd.action).toBe("replaced");
    expect(r2.mcpJson.action).toBe("skipped");
    expect(r2.personas.action).toBe("skipped");
    expect(r2.agents.updated.length).toBe(3);
    expect(r2.agents.added.length).toBe(0);
  });
});

describe("createWorkspace + paradigm symbiosis", () => {
  it("augments a Paradigm-shifted dir end-to-end", () => {
    const dir = join(tmpDir, "ws-augment-end-to-end");
    fakeParadigmShifted(dir);
    const result = createWorkspace(dir, {
      mode: "explicit",
      createdAt: new Date("2026-05-27T00:00:00.000Z"),
      force: true,
    });
    expect(result.paradigmAugmentation).toBeDefined();
    expect(result.paradigmAugmentation!.claudeMd.action).toBe("appended");
    expect(result.paradigmAugmentation!.agents.added.length).toBe(3);
    // All four sites present.
    expect(existsSync(join(dir, "workspace.atelier"))).toBe(true);
    expect(existsSync(join(dir, ".atelier", "learning-mode.yaml"))).toBe(true);
    expect(existsSync(join(dir, ".claude", "agents", "atelier-quill.md"))).toBe(true);
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf-8")).toContain(ATELIER_CLAUDE_MD_SECTION_BEGIN);
    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"));
    expect(mcp.mcpServers.atelier).toBeDefined();
  });

  it("skips augmentation when skipParadigmIntegration:true even with paradigm present", () => {
    const dir = join(tmpDir, "ws-augment-skip");
    fakeParadigmShifted(dir);
    const result = createWorkspace(dir, {
      mode: "ambient",
      skipParadigmIntegration: true,
      force: true,
    });
    expect(result.paradigmAugmentation).toBeUndefined();
    // Workspace files were still written.
    expect(existsSync(join(dir, "workspace.atelier"))).toBe(true);
    // But Paradigm-side files are unchanged (no agents dir, no atelier MCP entry).
    expect(existsSync(join(dir, ".claude", "agents", "atelier-quill.md"))).toBe(false);
    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"));
    expect(mcp.mcpServers.atelier).toBeUndefined();
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf-8")).not.toContain(ATELIER_CLAUDE_MD_SECTION_BEGIN);
  });

  it("returns paradigmAugmentation: undefined when paradigm is absent", () => {
    const dir = join(tmpDir, "ws-augment-no-paradigm");
    const result = createWorkspace(dir, { mode: "ambient" });
    expect(result.paradigmAugmentation).toBeUndefined();
    expect(result.manifest.name).toBe("ws-augment-no-paradigm");
  });
});

// ─── atelier reconstruct (CLI + runReconstruct) ──────────────────────
// The Veteran hero path's first CLI move: prime a project for Quill to
// reconstruct SCRIPT.md from a Whisper transcript. Tests inject a
// transcribeFn stub so we never spawn whisper-cpp in CI.

function writeMinimalProject(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "project.atelier"),
    JSON.stringify({
      version: "1.0",
      name: "reconstruct-test",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: {},
    }, null, 2),
    "utf-8",
  );
}

function writeFakeTranscript(dir: string, name = "transcript.json"): string {
  const path = join(dir, name);
  const fixture: VideoTranscript = {
    version: "1.1",
    language: "en",
    segments: [
      {
        text: "hello world",
        start: 0,
        end: 1.5,
        words: [
          { detected: "hello", text: "hello", start: 0, end: 0.7 },
          { detected: "world", text: "world", start: 0.8, end: 1.5 },
        ],
      },
    ],
  };
  writeFileSync(path, JSON.stringify(fixture, null, 2), "utf-8");
  return path;
}

function fakeTranscribeFn(): (dir: string) => Promise<TranscribeResult> {
  return async (dir: string) => {
    const transcriptPath = writeFakeTranscript(dir);
    return {
      projectDir: dir,
      backend: "stub",
      transcript: JSON.parse(readFileSync(transcriptPath, "utf-8")) as VideoTranscript,
      wordCount: 2,
      captionsGenerated: false,
    };
  };
}

async function runReconstructViaCli(
  argv: string[],
): Promise<{ code?: number; stdout: string; stderr: string }> {
  const program = new Command();
  program.exitOverride();
  reconstructCommand(program);

  const origExit = process.exit;
  const origLog = console.log;
  const origErr = console.error;
  let exitCode: number | undefined;
  let stdout = "";
  let stderr = "";

  (process.exit as unknown as (c?: number) => void) = ((c?: number) => {
    exitCode = c;
    throw new Error(`__exit_${c ?? 0}__`);
  }) as never;
  console.log = (msg?: unknown) => { stdout += String(msg) + "\n"; };
  console.error = (msg?: unknown) => { stderr += String(msg) + "\n"; };

  try {
    await program.parseAsync(["node", "atelier", "reconstruct", ...argv]);
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
  }
  return { code: exitCode, stdout, stderr };
}

describe("atelier reconstruct (runReconstruct)", () => {
  it("reuses an existing transcript.json (does not re-transcribe) and prints the hint", async () => {
    const dir = join(tmpDir, "reconstruct-existing");
    writeMinimalProject(dir);
    const transcriptPath = writeFakeTranscript(dir);

    // Sentinel: pass a stub that would throw if called. Reuse path must
    // never invoke it.
    const result: ReconstructResult = await runReconstruct({
      projectDir: dir,
      json: false,
      transcribeFn: async () => {
        throw new Error("transcribeFn should NOT be called when transcript.json already exists");
      },
    });

    expect(result.ok).toBe(true);
    expect(result.transcribed).toBe(false);
    expect(result.transcriptPath).toBe(transcriptPath);
    expect(result.ready).toBe(true);
    expect(result.scriptPath).toBeNull();
    expect(result.notes.some((n) => n.includes("transcript already present"))).toBe(true);
  });

  it("transcribes when no transcript yet but source video is present", async () => {
    const dir = join(tmpDir, "reconstruct-needs-transcribe");
    writeMinimalProject(dir);
    // Source video MUST be present for transcribe to be invoked.
    writeFileSync(join(dir, "source.mp4"), "not-real-mp4-bytes", "utf-8");

    let calls = 0;
    const stub = async (d: string) => {
      calls += 1;
      writeFakeTranscript(d);
      return {
        projectDir: d,
        backend: "stub",
        transcript: {} as VideoTranscript,
        wordCount: 2,
        captionsGenerated: false,
      };
    };

    const result = await runReconstruct({
      projectDir: dir,
      json: false,
      transcribeFn: stub,
    });

    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.transcribed).toBe(true);
    expect(result.transcriptPath).toBe(join(dir, "transcript.json"));
    expect(existsSync(result.transcriptPath)).toBe(true);
  });

  it("notes existing SCRIPT.md as `scriptPath: existing` so Quill preserves edits", async () => {
    const dir = join(tmpDir, "reconstruct-existing-script");
    writeMinimalProject(dir);
    writeFakeTranscript(dir);
    writeFileSync(join(dir, "SCRIPT.md"), "---\nmode: narrated\n---\n# Hook\n", "utf-8");

    const result = await runReconstruct({
      projectDir: dir,
      json: false,
      transcribeFn: fakeTranscribeFn(),
    });

    expect(result.scriptPath).toBe("existing");
  });

  it("exits 1 with a clear error when no source video and no transcript", async () => {
    const dir = join(tmpDir, "reconstruct-no-source");
    writeMinimalProject(dir);
    // No source.* AND no transcript.json — nothing to do.

    const res = await runReconstructViaCli([dir]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/no source video found/i);
  });

  it("exits 1 when the path is not an Atelier Project (missing project.atelier)", async () => {
    const dir = join(tmpDir, "reconstruct-bare-dir");
    mkdirSync(dir, { recursive: true });
    // No project.atelier scaffolded.

    const res = await runReconstructViaCli([dir]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/not an Atelier Project/);
  });

  it("--json emits { transcriptPath, scriptPath: null|\"existing\", ready: true }", async () => {
    const dir = join(tmpDir, "reconstruct-json");
    writeMinimalProject(dir);
    writeFakeTranscript(dir);

    const res = await runReconstructViaCli(["--json", dir]);
    expect(res.code).toBeUndefined();
    const payload = JSON.parse(res.stdout) as ReconstructResult;
    expect(payload.ok).toBe(true);
    expect(payload.ready).toBe(true);
    expect(payload.scriptPath).toBeNull();
    expect(payload.transcriptPath.endsWith("transcript.json")).toBe(true);
    expect(payload.transcribed).toBe(false);
  });

  it("falls back to cwd when no project-dir argument is supplied", async () => {
    const dir = join(tmpDir, "reconstruct-cwd-default");
    writeMinimalProject(dir);
    writeFakeTranscript(dir);

    const origCwd = process.cwd;
    process.cwd = () => dir;
    try {
      const result = await runReconstruct({
        projectDir: process.cwd(),
        json: false,
        transcribeFn: fakeTranscribeFn(),
      });
      expect(result.projectDir).toBe(dir);
    } finally {
      process.cwd = origCwd;
    }
  });

  it("picks up a transcripts/<name>.json secondary location when canonical transcript.json is absent", async () => {
    const dir = join(tmpDir, "reconstruct-transcripts-dir");
    writeMinimalProject(dir);
    // No transcript.json at root. Forward-compat shape from the spec doc:
    mkdirSync(join(dir, "transcripts"), { recursive: true });
    writeFakeTranscript(join(dir, "transcripts"), "clip1.json");

    const result = await runReconstruct({
      projectDir: dir,
      json: false,
      transcribeFn: async () => {
        throw new Error("transcribeFn should NOT be called when a transcripts/*.json exists");
      },
    });
    expect(result.transcribed).toBe(false);
    expect(result.transcriptPath.endsWith("clip1.json")).toBe(true);
  });
});

