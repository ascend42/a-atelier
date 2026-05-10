/**
 * FFmpeg WASM encoding pipeline (T-003).
 * Accepts a stream of raw RGBA frames and encodes them to MP4 or WebM
 * without requiring a system FFmpeg install — runs entirely in-browser
 * via @ffmpeg/ffmpeg WASM in a dedicated Worker.
 *
 * This module is a skeleton — full implementation lands in T-003.
 * Interface is stable so callers can be written against it now.
 */

export type EncodeFormat = "mp4" | "webm";

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
  format: EncodeFormat;
  /** Output filename (default: "export.mp4" / "export.webm") */
  filename?: string;
  /** CRF quality 0–51 for MP4 (default 18), ignored for WebM */
  crf?: number;
}

export interface EncodeProgress {
  framesEncoded: number;
  totalFrames: number;
  percent: number;
}

/**
 * Encodes a sequence of canvas frames to a video file using FFmpeg WASM.
 *
 * Usage (T-003 full implementation):
 *   const encoder = new FfmpegEncoder({ width: 1920, height: 1080, fps: 30, format: "mp4" });
 *   await encoder.init();
 *   for (let f = 0; f < totalFrames; f++) {
 *     renderFrame(ctx, resolveFrame(doc, state, f), doc, opts);
 *     await encoder.writeFrame(canvas);
 *   }
 *   const blob = await encoder.finalize();
 */
export class FfmpegEncoder {
  readonly options: Required<EncodeOptions>;

  constructor(options: EncodeOptions) {
    this.options = {
      filename: `export.${options.format}`,
      crf: 18,
      ...options,
    };
  }

  /**
   * Load the FFmpeg WASM core. Must be awaited before writeFrame.
   * Loads @ffmpeg/core from CDN — bundle separately for offline use.
   */
  async init(): Promise<void> {
    // @ffmpeg/ffmpeg dynamic import + load goes here in T-003.
    throw new Error("FfmpegEncoder: T-003 implementation pending. init() not yet available.");
  }

  /**
   * Write one rendered canvas frame to the encode queue.
   * @param canvas - The canvas element after renderFrame has been called on it.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async writeFrame(_canvas: HTMLCanvasElement, _onProgress?: (p: EncodeProgress) => void): Promise<void> {
    throw new Error("FfmpegEncoder: T-003 implementation pending.");
  }

  /**
   * Finalize the encode and return the output as a Blob.
   * After this, the encoder instance should be disposed.
   */
  async finalize(): Promise<Blob> {
    throw new Error("FfmpegEncoder: T-003 implementation pending.");
  }

  dispose(): void {
    // Release FFmpeg WASM memory on T-003 completion.
  }
}
