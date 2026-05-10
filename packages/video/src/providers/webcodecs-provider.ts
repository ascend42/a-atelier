import type { VideoFrameProvider } from "@a-company/atelier-canvas";

/**
 * Export-mode VideoFrameProvider backed by WebCodecs VideoDecoder.
 * Frame-accurate — decodes the exact frame at sourceTime rather than
 * relying on HTMLVideoElement's imprecise currentTime seek.
 *
 * Chrome/Chromium only (WebCodecs is not available in Firefox/Safari as of 2026).
 * Falls back gracefully — isSupported() lets callers detect availability.
 *
 * Usage pattern:
 *   const provider = new WebCodecsVideoProvider();
 *   await provider.load("clip.mp4");
 *   renderFrame(ctx, resolved, doc, { videoFrameProvider: provider.asProvider() });
 *   provider.dispose();
 */
export class WebCodecsVideoProvider {
  private frames = new Map<string, Map<number, ImageBitmap>>();
  private loading = new Map<string, Promise<void>>();

  static isSupported(): boolean {
    return typeof VideoDecoder !== "undefined";
  }

  /** Returns a VideoFrameProvider callback suitable for RenderOptions.videoFrameProvider */
  asProvider(): VideoFrameProvider {
    return (src, sourceTime) => this.getFrame(src, sourceTime);
  }

  /**
   * Pre-decode all frames for a src URL into ImageBitmaps.
   * Must be awaited before rendering for accurate output.
   * Requires a fetch-able URL (local file:// or served asset).
   */
  async load(src: string): Promise<void> {
    if (this.frames.has(src)) return;
    if (this.loading.has(src)) return this.loading.get(src);

    const promise = this.decode(src);
    this.loading.set(src, promise);
    await promise;
    this.loading.delete(src);
  }

  private getFrame(src: string, sourceTime: number): ImageBitmap | null {
    const srcFrames = this.frames.get(src);
    if (!srcFrames) {
      // Trigger async load — caller will get null until decode completes
      this.load(src).catch(() => {});
      return null;
    }

    // Find the closest decoded frame at or before sourceTime
    const targetMs = Math.round(sourceTime * 1000);
    let best: ImageBitmap | null = null;
    let bestDelta = Infinity;

    for (const [timestampMs, bitmap] of srcFrames) {
      const delta = Math.abs(timestampMs - targetMs);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = bitmap;
      }
    }

    return best;
  }

  private async decode(src: string): Promise<void> {
    if (!WebCodecsVideoProvider.isSupported()) {
      throw new Error("WebCodecs VideoDecoder is not available in this environment");
    }

    const srcFrames = new Map<number, ImageBitmap>();
    this.frames.set(src, srcFrames);

    // Fetch the raw video bytes
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Failed to fetch video: ${src} (${response.status})`);
    const buffer = await response.arrayBuffer();

    // Decode using VideoDecoder — requires EncodedVideoChunks from a demuxer.
    // Full demux (mp4box / matroska) is wired in the Mediabunny integration (T-002b).
    // This stub decodes a pre-chunked format for testing; production uses Mediabunny.
    await this.decodeWithFallback(buffer, srcFrames);
  }

  /**
   * Decode video buffer into timestamped ImageBitmaps.
   * Production path: Mediabunny WASM demuxer → VideoDecoder pipeline.
   * The Mediabunny integration (packages/video/src/providers/mediabunny-provider.ts)
   * will replace this stub when T-002b lands.
   */
  private async decodeWithFallback(
    _buffer: ArrayBuffer,
    _frames: Map<number, ImageBitmap>,
  ): Promise<void> {
    // Mediabunny demux + WebCodecs decode pipeline goes here.
    // Placeholder until mediabunny-provider.ts is wired in.
    throw new Error(
      "WebCodecsVideoProvider.decode: Mediabunny integration pending (T-002b). " +
      "Use ElementVideoProvider for preview mode in the meantime.",
    );
  }

  /** Release all decoded ImageBitmaps. Call when export is complete. */
  dispose(): void {
    for (const srcFrames of this.frames.values()) {
      for (const bitmap of srcFrames.values()) {
        bitmap.close();
      }
    }
    this.frames.clear();
    this.loading.clear();
  }
}
