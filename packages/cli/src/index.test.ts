import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AtelierDocument } from "@atelier/types";
import { serializeAtelier } from "@atelier/schema";
import { validateFile } from "./commands/validate.js";
import { getInfo } from "./commands/info.js";
import { resolveStill } from "./commands/still.js";
import { buildFfmpegArgs, checkFfmpeg } from "./commands/render-pipeline.js";

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
