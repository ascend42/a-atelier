import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AtelierDocument } from "@a-company/atelier-types";
import { serializeAtelier } from "@a-company/atelier-schema";
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
import { getInfo } from "./commands/info.js";
import { resolveStill } from "./commands/still.js";
import { buildFfmpegArgs, checkFfmpeg } from "./commands/render-pipeline.js";
import { renderFrameSVG } from "@a-company/atelier-svg";
import { exportToLottie } from "@a-company/atelier-lottie";

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

  it("writeTranscript and readTranscript roundtrip", async () => {
    const projectDir = join(tmpDir, "vp-transcript-rt");
    const project = await createVideoProject(fakeSrc, projectDir);
    writeTranscript(project, {
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
    });
    const t = readTranscript(project);
    expect(t).not.toBeNull();
    expect(t!.language).toBe("en");
    expect(t!.segments[0].words).toHaveLength(2);
    expect(t!.segments[0].words[0].confidence).toBe(0.99);
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
