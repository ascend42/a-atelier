/**
 * Browser-based export for Atelier documents.
 *
 * MP4 path:  WebCodecs VideoEncoder + mp4-muxer (dynamic import).
 * WebM path: WebCodecs VideoEncoder + webm-muxer (dynamic import) — supports alpha.
 * GIF path:  Built-in GIF89a encoder (no deps).
 */

import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveFrame } from "@a-company/atelier-core";
import { renderFrame, ImageCache } from "@a-company/atelier-canvas";
import { createGifEncoder } from "./gif-encoder.js";

// ── Capability checks ──────────────────────────────────────────

/** Returns true if the browser supports WebCodecs (needed for MP4/WebM export). */
export function supportsWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined"
  );
}

/** WebM export uses the same WebCodecs API as MP4. */
export function supportsWebM(): boolean {
  return supportsWebCodecs();
}

/** GIF export is always available (built-in encoder). */
export function supportsGifExport(): boolean {
  return true;
}

// ── Public types ───────────────────────────────────────────────

export type ExportFormat = "mp4" | "gif" | "webm";

export interface ExportOptions {
  format: ExportFormat;
  /** Which states to render. Defaults to all states in document order. */
  states?: string[];
  /** Progress callback — called after each frame. */
  onProgress?: (info: { frame: number; total: number; percent: number }) => void;
}

export interface ExportResult {
  blob: Blob;
  format: ExportFormat;
  totalFrames: number;
  durationMs: number;
}

// ── Main export entry ──────────────────────────────────────────

/**
 * Render all frames of a document and encode to MP4, WebM, or GIF.
 *
 * The provided canvas is used as a scratch surface — its contents will
 * be overwritten during export. Caller should pause playback first.
 */
export async function exportDocument(
  doc: AtelierDocument,
  canvas: HTMLCanvasElement,
  imageCache: ImageCache,
  opts: ExportOptions,
): Promise<ExportResult> {
  if (opts.format === "mp4") {
    return exportMP4(doc, canvas, imageCache, opts);
  }
  if (opts.format === "webm") {
    return exportWebM(doc, canvas, imageCache, opts);
  }
  return exportGIF(doc, canvas, imageCache, opts);
}

// ── Managed encoder wrapper ────────────────────────────────────

/**
 * Wraps VideoEncoder with proper error capture and backpressure.
 *
 * The raw VideoEncoder fires errors via an async callback that can't
 * propagate to our async function. This wrapper captures errors and
 * exposes them synchronously so the frame loop can check before each
 * encode.
 */
interface ManagedEncoder {
  encoder: VideoEncoder;
  /** Throws the stored error if the encoder has failed. */
  checkError(): void;
  /** Wait until the encode queue drains below the threshold. */
  waitForDrain(): Promise<void>;
}

function createManagedEncoder(
  onChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void,
): ManagedEncoder {
  let encError: DOMException | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      onChunk(chunk, meta ?? undefined);
    },
    error: (e) => {
      encError = e;
    },
  });

  function checkError(): void {
    if (encError) {
      const msg = encError.message;
      encError = null;
      throw new Error(`VideoEncoder error: ${msg}`);
    }
    if (encoder.state === "closed") {
      throw new Error("VideoEncoder closed unexpectedly.");
    }
  }

  async function waitForDrain(): Promise<void> {
    // Drain if the encoder has more than 5 frames queued, to avoid
    // memory pressure and give the encoder time to process.
    while (encoder.state === "configured" && encoder.encodeQueueSize > 5) {
      await yieldToMain();
      if (encError) checkError();
    }
  }

  return { encoder, checkError, waitForDrain };
}

// ── MP4 Export (WebCodecs + mp4-muxer) ─────────────────────────

async function exportMP4(
  doc: AtelierDocument,
  canvas: HTMLCanvasElement,
  imageCache: ImageCache,
  opts: ExportOptions,
): Promise<ExportResult> {
  if (!supportsWebCodecs()) {
    throw new Error("WebCodecs API not available — MP4 export requires a modern browser.");
  }

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const fps = doc.canvas.fps ?? 30;
  const width = doc.canvas.width;
  const height = doc.canvas.height;

  // H.264 requires even dimensions
  const encWidth = width % 2 === 0 ? width : width + 1;
  const encHeight = height % 2 === 0 ? height : height + 1;

  // Try H.264 profiles from highest capability to lowest
  const codecCandidates: VideoEncoderConfig[] = [
    { codec: "avc1.640033", width: encWidth, height: encHeight, bitrate: 5_000_000, framerate: fps }, // High 5.1 (4K)
    { codec: "avc1.64002a", width: encWidth, height: encHeight, bitrate: 5_000_000, framerate: fps }, // High 4.2 (1080p60)
    { codec: "avc1.640028", width: encWidth, height: encHeight, bitrate: 5_000_000, framerate: fps }, // High 4.0 (1080p30)
    { codec: "avc1.42001f", width: encWidth, height: encHeight, bitrate: 5_000_000, framerate: fps }, // Baseline 3.1 (720p)
  ];

  let support: VideoEncoderSupport | null = null;
  for (const candidate of codecCandidates) {
    const result = await VideoEncoder.isConfigSupported(candidate);
    if (result.supported) {
      support = result;
      break;
    }
  }

  if (!support?.supported) {
    throw new Error(
      `H.264 codec not supported for ${encWidth}\u00D7${encHeight} at ${fps}fps. ` +
      `Try exporting as GIF or WebM instead.`,
    );
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: encWidth,
      height: encHeight,
    },
    fastStart: "in-memory",
  });

  const { encoder, checkError, waitForDrain } = createManagedEncoder(
    (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  );

  encoder.configure(support.config!);

  // Let the encoder process the config before we start encoding
  await yieldToMain();
  checkError();

  const frames = collectFrames(doc, opts.states);
  const totalFrames = frames.length;
  const frameDurationUs = Math.round(1_000_000 / fps);

  const ctx = canvas.getContext("2d")!;
  const origWidth = canvas.width;
  const origHeight = canvas.height;
  if (encWidth !== width || encHeight !== height) {
    canvas.width = encWidth;
    canvas.height = encHeight;
  }

  try {
    for (let i = 0; i < totalFrames; i++) {
      checkError();
      await waitForDrain();

      const { state, frame } = frames[i];
      const resolved = resolveFrame(doc, state, frame);
      renderFrame(ctx as any, resolved, doc, imageCache);

      const timestamp = i * frameDurationUs;
      const videoFrame = new VideoFrame(canvas, { timestamp });
      encoder.encode(videoFrame, { keyFrame: i % 60 === 0 });
      videoFrame.close();

      opts.onProgress?.({
        frame: i + 1,
        total: totalFrames,
        percent: Math.round(((i + 1) / totalFrames) * 100),
      });

      if (i % 10 === 9) await yieldToMain();
    }

    await encoder.flush();
    checkError();
    encoder.close();
    muxer.finalize();
  } finally {
    // Restore canvas dimensions even if encoding fails
    if (encWidth !== width || encHeight !== height) {
      canvas.width = origWidth;
      canvas.height = origHeight;
    }
  }

  const durationMs = Math.round((totalFrames / fps) * 1000);
  return {
    blob: new Blob([target.buffer], { type: "video/mp4" }),
    format: "mp4",
    totalFrames,
    durationMs,
  };
}

// ── WebM Export (WebCodecs VP9 + webm-muxer, alpha support) ────

async function exportWebM(
  doc: AtelierDocument,
  _canvas: HTMLCanvasElement,
  imageCache: ImageCache,
  opts: ExportOptions,
): Promise<ExportResult> {
  if (!supportsWebCodecs()) {
    throw new Error("WebCodecs API not available — WebM export requires a modern browser.");
  }

  const { Muxer, ArrayBufferTarget } = await import("webm-muxer");

  const fps = doc.canvas.fps ?? 30;
  const width = doc.canvas.width;
  const height = doc.canvas.height;

  // Try VP9 with alpha first, fall back to VP9 without alpha, then VP8
  const codecCandidates: VideoEncoderConfig[] = [
    {
      codec: "vp09.00.10.08",
      width,
      height,
      bitrate: 5_000_000,
      framerate: fps,
      alpha: "keep",
    },
    {
      codec: "vp09.00.10.08",
      width,
      height,
      bitrate: 5_000_000,
      framerate: fps,
    },
    {
      codec: "vp8",
      width,
      height,
      bitrate: 5_000_000,
      framerate: fps,
    },
  ];

  let chosenConfig: VideoEncoderConfig | null = null;
  for (const candidate of codecCandidates) {
    const support = await VideoEncoder.isConfigSupported(candidate);
    if (support.supported) {
      chosenConfig = support.config!;
      break;
    }
  }

  if (!chosenConfig) {
    throw new Error(
      `No supported VP9/VP8 codec for ${width}\u00D7${height}. ` +
      `Try exporting as MP4 or GIF instead.`,
    );
  }

  const hasAlpha = chosenConfig.alpha === "keep";
  const muxCodec = chosenConfig.codec.startsWith("vp09") ? "V_VP9" : "V_VP8";

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: muxCodec,
      width,
      height,
    },
  });

  const { encoder, checkError, waitForDrain } = createManagedEncoder(
    (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  );

  encoder.configure(chosenConfig);

  await yieldToMain();
  checkError();

  const frames = collectFrames(doc, opts.states);
  const totalFrames = frames.length;
  const frameDurationUs = Math.round(1_000_000 / fps);

  // Use a separate canvas with explicit alpha setting
  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = width;
  alphaCanvas.height = height;
  const ctx = alphaCanvas.getContext("2d", { alpha: hasAlpha })!;

  for (let i = 0; i < totalFrames; i++) {
    checkError();
    await waitForDrain();

    const { state, frame } = frames[i];
    const resolved = resolveFrame(doc, state, frame);
    ctx.clearRect(0, 0, width, height);
    renderFrame(ctx as any, resolved, doc, imageCache);

    const timestamp = i * frameDurationUs;
    const frameOpts: VideoFrameInit = { timestamp };
    if (hasAlpha) (frameOpts as any).alpha = "keep";
    const videoFrame = new VideoFrame(alphaCanvas, frameOpts);
    encoder.encode(videoFrame, { keyFrame: i % 60 === 0 });
    videoFrame.close();

    opts.onProgress?.({
      frame: i + 1,
      total: totalFrames,
      percent: Math.round(((i + 1) / totalFrames) * 100),
    });

    if (i % 10 === 9) await yieldToMain();
  }

  await encoder.flush();
  checkError();
  encoder.close();
  muxer.finalize();

  const durationMs = Math.round((totalFrames / fps) * 1000);
  return {
    blob: new Blob([target.buffer], { type: "video/webm" }),
    format: "webm",
    totalFrames,
    durationMs,
  };
}

// ── GIF Export ──────────────────────────────────────────────────

async function exportGIF(
  doc: AtelierDocument,
  canvas: HTMLCanvasElement,
  imageCache: ImageCache,
  opts: ExportOptions,
): Promise<ExportResult> {
  const fps = doc.canvas.fps ?? 30;
  const width = doc.canvas.width;
  const height = doc.canvas.height;
  const ctx = canvas.getContext("2d")!;

  const frames = collectFrames(doc, opts.states);
  const totalFrames = frames.length;

  const encoder = createGifEncoder(width, height);

  // GIF delays are in centiseconds (10ms granularity). Browsers clamp
  // very short delays — Firefox treats ≤2cs as 100ms, Chrome ≤1cs.
  // We use 3cs (30ms) minimum, which is safe across all browsers and
  // gives a maximum effective GIF framerate of ~33fps.
  //
  // For high-fps documents (e.g. 60fps) we skip source frames so the
  // animation plays at the correct speed — just at reduced smoothness,
  // not reduced tempo.
  const MIN_DELAY_CS = 3;
  const minFrameMs = MIN_DELAY_CS * 10;

  let accGifTimeMs = 0;
  let gifFrameCount = 0;

  for (let i = 0; i < totalFrames; i++) {
    const frameEndMs = ((i + 1) * 1000) / fps;

    // Skip this frame if not enough real time has elapsed for a GIF
    // frame — but always emit the last frame.
    if (frameEndMs - accGifTimeMs < minFrameMs && i < totalFrames - 1) {
      opts.onProgress?.({
        frame: i + 1,
        total: totalFrames,
        percent: Math.round(((i + 1) / totalFrames) * 100),
      });
      continue;
    }

    const { state, frame } = frames[i];
    const resolved = resolveFrame(doc, state, frame);
    renderFrame(ctx as any, resolved, doc, imageCache);

    const delayCentiseconds = Math.max(MIN_DELAY_CS, Math.round((frameEndMs - accGifTimeMs) / 10));
    accGifTimeMs += delayCentiseconds * 10;

    const imageData = ctx.getImageData(0, 0, width, height);
    encoder.addFrame(imageData.data, delayCentiseconds);
    gifFrameCount++;

    opts.onProgress?.({
      frame: i + 1,
      total: totalFrames,
      percent: Math.round(((i + 1) / totalFrames) * 100),
    });

    if (gifFrameCount % 10 === 9) await yieldToMain();
  }

  const bytes = encoder.finish();
  const durationMs = Math.round((totalFrames / fps) * 1000);

  return {
    blob: new Blob([bytes.buffer as ArrayBuffer], { type: "image/gif" }),
    format: "gif",
    totalFrames,
    durationMs,
  };
}

// ── Helpers ────────────────────────────────────────────────────

interface FrameEntry {
  state: string;
  frame: number;
}

function collectFrames(
  doc: AtelierDocument,
  stateNames?: string[],
): FrameEntry[] {
  const names = stateNames ?? Object.keys(doc.states);
  const entries: FrameEntry[] = [];
  for (const state of names) {
    const s = doc.states[state];
    if (!s) continue;
    for (let f = 0; f < s.duration; f++) {
      entries.push({ state, frame: f });
    }
  }
  return entries;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
