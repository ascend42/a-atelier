/**
 * Core render pipeline — renders an Atelier document to MP4 or GIF via FFmpeg.
 * Pure pipeline with no Commander dependency; testable in isolation.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveFrame } from "@a-company/atelier-core";
import { renderFrame, ImageCache, type RenderContext } from "@a-company/atelier-canvas";
import { loadCanvasModule } from "../lib/render-image.js";

// ─── Types ───────────────────────────────────────────────────

export type RenderFormat = "mp4" | "gif";

export interface RenderOptions {
  output: string;
  format: RenderFormat;
  states?: string[];
  onProgress?: (info: ProgressInfo) => void;
  /**
   * Absolute path of the .atelier document being rendered. Used to resolve
   * relative `media/...` src paths in VideoVisual layers. When set, the
   * pipeline detects the first video layer, passes the source MOV/MP4 to
   * ffmpeg as a SECOND input, and uses an overlay filter to composite the
   * caption canvas ON TOP of the source video frames (instead of feeding
   * the encoder a synthetic canvas-only stream). Source audio is also
   * mapped through verbatim. This is what closes the
   * RENDER-AUDIO-ISSUE.md gap reported by the agent team on 2026-05-28.
   *
   * Omitted → legacy behaviour (canvas-only frames, no audio).
   */
  docPath?: string;
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

/**
 * Build the FFmpeg argument array for the given format. Pure function.
 *
 * When `sourceVideoPath` is provided, ffmpeg gets TWO inputs:
 *   - Input 0: the source video file (decoded photographic frames + audio)
 *   - Input 1: raw RGBA canvas frames on stdin (the caption overlay)
 *
 * A `[0:v][1:v]overlay` filter composites the canvas on top of the source
 * video at matching timestamps. Source audio is copied through with
 * `-map 0:a -c:a copy` (no re-encode). The MP4 output then has full source
 * video bitrate + source audio + caption overlays — what the studio's
 * MediaRecorder path produces by accident, but deterministically and
 * scriptable for agent use.
 *
 * When `sourceVideoPath` is omitted, falls back to the legacy stdin-only
 * mode (canvas frames only, no source pixels, no audio). Used by docs
 * without any VideoVisual layers (e.g. text-only animations, image
 * carousels).
 */
export function buildFfmpegArgs(
  width: number,
  height: number,
  fps: number,
  format: RenderFormat,
  output: string,
  sourceVideoPath?: string,
): string[] {
  if (sourceVideoPath && format === "mp4") {
    // Two-input overlay mode — closes the canvas-only / no-audio gap.
    return [
      "-y",
      // Input 0: source video (+ audio). ffmpeg auto-decodes via libavformat.
      "-i", sourceVideoPath,
      // Input 1: canvas overlay frames on stdin. Same dimensions + fps as
      // the doc so the overlay aligns frame-for-frame with input 0.
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "-s", `${width}x${height}`,
      "-r", String(fps),
      "-i", "pipe:0",
      // Filter graph:
      //   1. Scale + pad the source video to the doc's canvas dimensions
      //      with `force_original_aspect_ratio=decrease` (letterbox-fit, no
      //      crop) so a 4K iPhone source rendered into a 1080x1920 doc
      //      respects the doc's intent instead of upscaling everything to
      //      source dimensions. The pad fills gutters with black if the
      //      source aspect differs from the canvas aspect.
      //   2. Overlay the caption canvas on top. Canvas frames must have
      //      transparent backgrounds — renderFrame's clearRect (fixed
      //      2026-05-28) gives true transparency by default.
      "-filter_complex",
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black[bg];[bg][1:v]overlay=0:0[v]`,
      "-map", "[v]",
      // Copy the source audio track verbatim. No re-encode.
      "-map", "0:a?",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "medium",
      "-crf", "18",
      "-c:a", "copy",
      // `-shortest` so the output ends with whichever stream finishes first
      // (typically the source video — we render exactly that many canvas
      // frames). Without it, if the canvas had a few extra frames the
      // output would have a silent tail.
      "-shortest",
      "-movflags", "+faststart",
      output,
    ];
  }

  // Legacy stdin-only path — canvas frames only, no source video, no audio.
  // Used when the doc has no VideoVisual layers, OR for GIF (which has no
  // audio container anyway).
  const input = [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
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

/**
 * Locate the first VideoVisual layer's source file as an absolute filesystem
 * path. Returns null when no video layer exists, or when the layer's src is
 * relative and we don't know the doc's directory.
 *
 * Multi-clip rendering is v1.1 — for now we pick the first VideoVisual,
 * which matches the v1.0 single-clip composition path.
 */
export function findPrimaryVideoSource(
  doc: AtelierDocument,
  docPath: string | undefined,
): string | null {
  for (const layer of doc.layers) {
    if (layer.visual.type !== "video") continue;
    const v = layer.visual as { src?: string; assetId?: string };
    const src = v.src ?? (v.assetId ? doc.assets?.[v.assetId]?.src : undefined);
    if (!src) continue;
    if (isAbsolute(src)) {
      return existsSync(src) ? src : null;
    }
    if (!docPath) return null;
    const absolute = resolve(dirname(docPath), src);
    return existsSync(absolute) ? absolute : null;
  }
  return null;
}

// ─── Image Pre-loading ───────────────────────────────────────

/**
 * Scan document layers for image visuals, pre-load them with the canvas
 * module's loadImage, and return a populated ImageCache ready for rendering.
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
 * Rasterizes via `@napi-rs/canvas` (prebuilt platform binaries, a hard
 * dependency) — the same rasterizer `export-image` and `still` use, so a
 * plain `npm install` can render with no native build.
 */
export async function renderDocument(
  doc: AtelierDocument,
  opts: RenderOptions,
): Promise<RenderResult> {
  const { createCanvas, loadImage } = await loadCanvasModule();

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

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as RenderContext & {
    getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
  };

  // Detect the source video (if any) so ffmpeg can overlay the canvas on
  // top of the decoded source pixels AND copy the source audio track —
  // the agent team's RENDER-AUDIO-ISSUE.md root cause.
  const sourceVideoPath = findPrimaryVideoSource(doc, opts.docPath) ?? undefined;
  // Spawn FFmpeg
  const ffmpegArgs = buildFfmpegArgs(width, height, fps, format, output, sourceVideoPath);
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
      renderFrame(ctx, resolved, doc, imageCache);

      // Straight (non-premultiplied) RGBA, matching ffmpeg's `rgba` input.
      const { data } = ctx.getImageData(0, 0, width, height);
      const raw = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
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
