/**
 * Core render pipeline — renders an Atelier document to MP4 or GIF via FFmpeg.
 * Pure pipeline with no Commander dependency; testable in isolation.
 */

import { spawn } from "node:child_process";
import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveFrame } from "@a-company/atelier-core";
import { renderFrame, ImageCache } from "@a-company/atelier-canvas";

// ─── Types ───────────────────────────────────────────────────

export type RenderFormat = "mp4" | "gif";

export interface RenderOptions {
  output: string;
  format: RenderFormat;
  states?: string[];
  onProgress?: (info: ProgressInfo) => void;
}

export interface ProgressInfo {
  frame: number;
  totalFrames: number;
  state: string;
  percent: number;
}

export interface RenderResult {
  output: string;
  format: RenderFormat;
  totalFrames: number;
  states: string[];
  durationMs: number;
}

// ─── FFmpeg Helpers ──────────────────────────────────────────

/** Check whether FFmpeg is available on the system PATH. */
export async function checkFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { stdio: "pipe" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/** Build the FFmpeg argument array for the given format. Pure function. */
export function buildFfmpegArgs(
  width: number,
  height: number,
  fps: number,
  format: RenderFormat,
  output: string,
): string[] {
  const input = [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "bgra",
    "-s", `${width}x${height}`,
    "-r", String(fps),
    "-i", "pipe:0",
  ];

  if (format === "mp4") {
    return [
      ...input,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "medium",
      "-crf", "18",
      "-movflags", "+faststart",
      output,
    ];
  }

  // GIF — single-pass palette generation (stdin-compatible)
  return [
    ...input,
    "-vf", "split[s0][s1];[s0]palettegen=stats_mode=single[p];[s1][p]paletteuse=dither=sierra2_4a",
    "-loop", "0",
    output,
  ];
}

// ─── Image Pre-loading ───────────────────────────────────────

/**
 * Scan document layers for image visuals, pre-load them with node-canvas
 * loadImage, and return a populated ImageCache ready for rendering.
 */
async function preloadImages(
  doc: AtelierDocument,
  loadImage: (src: string) => Promise<unknown>,
): Promise<ImageCache> {
  const sources = new Set<string>();

  for (const layer of doc.layers) {
    if (layer.visual.type === "image") {
      const iv = layer.visual as { src?: string; assetId?: string };
      if (iv.src) {
        sources.add(iv.src);
      } else if (iv.assetId && doc.assets?.[iv.assetId]) {
        sources.add(doc.assets[iv.assetId].src);
      }
    }
  }

  if (sources.size === 0) {
    return new ImageCache();
  }

  // Load all images in parallel
  const preloaded = new Map<string, unknown>();
  await Promise.all(
    [...sources].map(async (src) => {
      try {
        preloaded.set(src, await loadImage(src));
      } catch {
        // Images that fail to load will render as blank
      }
    }),
  );

  // Create ImageCache pre-populated with loaded images.
  // createImage returns the pre-loaded image and fires onLoad on next tick
  // so that the ImageCache internal `image` variable is assigned first.
  const imageCache = new ImageCache({
    createImage: (src, onLoad, onError) => {
      const img = preloaded.get(src);
      if (img) {
        process.nextTick(onLoad);
        return img;
      }
      process.nextTick(onError);
      return {};
    },
  });

  for (const src of preloaded.keys()) {
    imageCache.load(src);
  }

  // Wait for nextTick callbacks to populate the cache
  await new Promise<void>((resolve) => process.nextTick(resolve));

  return imageCache;
}

// ─── Main Render Loop ────────────────────────────────────────

/**
 * Render an Atelier document to a video/GIF file via FFmpeg.
 * Dynamically imports `canvas` (node-canvas) — fails with a helpful
 * message if the native dependency is not installed.
 */
export async function renderDocument(
  doc: AtelierDocument,
  opts: RenderOptions,
): Promise<RenderResult> {
  // Dynamic import — canvas requires native compilation.
  // Use a variable to avoid TypeScript resolving the module at compile time.
  const canvasModuleName = "canvas";
  let createCanvas: (w: number, h: number) => unknown;
  let loadImage: (src: string) => Promise<unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvasModule = await import(/* webpackIgnore: true */ canvasModuleName);
    createCanvas = canvasModule.createCanvas;
    loadImage = canvasModule.loadImage;
  } catch {
    throw new Error(
      "The 'canvas' package is not installed.\n" +
      "Install it with:\n" +
      "  npm install canvas\n" +
      "Prerequisites vary by OS:\n" +
      "  macOS:   brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman\n" +
      "  Ubuntu:  sudo apt install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev\n" +
      "See: https://github.com/Automattic/node-canvas#compiling",
    );
  }

  const { width, height, fps } = doc.canvas;
  const { output, format, states, onProgress } = opts;

  // H.264 requires even dimensions
  if (format === "mp4" && (width % 2 !== 0 || height % 2 !== 0)) {
    throw new Error(
      `H.264 requires even dimensions. Canvas is ${width}\u00d7${height}. ` +
      `Try ${width + (width % 2)}\u00d7${height + (height % 2)}.`,
    );
  }

  // Resolve which states to render
  const allStates = Object.keys(doc.states);
  const renderStates = states ?? allStates;
  for (const s of renderStates) {
    if (!(s in doc.states)) {
      throw new Error(
        `State "${s}" not found. Available: ${allStates.join(", ")}`,
      );
    }
  }

  // Total frame count across all states
  let totalFrames = 0;
  for (const s of renderStates) {
    totalFrames += doc.states[s].duration;
  }

  if (totalFrames === 0) {
    throw new Error("Nothing to render \u2014 all states have duration 0");
  }

  // Pre-load images before the render loop
  const imageCache = await preloadImages(doc, loadImage);

  // Create node-canvas
  const canvas = createCanvas(width, height) as { getContext(id: "2d"): unknown; toBuffer(format: "raw"): Buffer };
  const ctx = canvas.getContext("2d");

  // Spawn FFmpeg
  const ffmpegArgs = buildFfmpegArgs(width, height, fps, format, output);
  const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderrOutput = "";
  ffmpeg.stderr?.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  const startTime = Date.now();
  let frameIndex = 0;

  for (const stateName of renderStates) {
    const duration = doc.states[stateName].duration;
    for (let f = 0; f < duration; f++) {
      const resolved = resolveFrame(doc, stateName, f);
      renderFrame(ctx as never, resolved, doc, imageCache);

      const raw = canvas.toBuffer("raw");
      const canWrite = ffmpeg.stdin!.write(raw);
      if (!canWrite) {
        await new Promise<void>((resolve) =>
          ffmpeg.stdin!.once("drain", resolve),
        );
      }

      frameIndex++;
      onProgress?.({
        frame: frameIndex,
        totalFrames,
        state: stateName,
        percent: Math.round((frameIndex / totalFrames) * 100),
      });
    }
  }

  // Close stdin and wait for FFmpeg to exit
  ffmpeg.stdin!.end();

  const exitCode = await new Promise<number | null>((resolve) => {
    ffmpeg.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(
      `FFmpeg exited with code ${exitCode}.\n${stderrOutput.slice(-500)}`,
    );
  }

  return {
    output,
    format,
    totalFrames,
    states: renderStates,
    durationMs: Date.now() - startTime,
  };
}
