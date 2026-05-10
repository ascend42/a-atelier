import type { VideoFrameProvider } from "@a-company/atelier-canvas";

/**
 * Preview-mode VideoFrameProvider backed by HTMLVideoElement.
 * One element is created per unique src URL and reused across frames.
 * Seeks via currentTime — fast but not frame-accurate (fine for preview scrubbing).
 * Returns null while loading or seeking; caller retries next render tick.
 */
export class ElementVideoProvider {
  private elements = new Map<string, HTMLVideoElement>();
  private seeking = new Set<string>();
  private readonly onFrame?: () => void;

  /**
   * @param options.onFrame - Called after each seek completes so the caller
   *   can trigger a re-render (e.g. requestAnimationFrame) without polling.
   */
  constructor(options?: { onFrame?: () => void }) {
    this.onFrame = options?.onFrame;
  }

  /** Returns a VideoFrameProvider callback suitable for RenderOptions.videoFrameProvider */
  asProvider(): VideoFrameProvider {
    return (src, sourceTime) => this.getFrame(src, sourceTime);
  }

  private getFrame(src: string, sourceTime: number): HTMLVideoElement | null {
    let el = this.elements.get(src);

    if (!el) {
      el = this.createElement(src);
      this.elements.set(src, el);
      this.seekTo(el, src, sourceTime);
      return null;
    }

    // Seek if we're more than one frame off and not already seeking
    if (!this.seeking.has(src) && Math.abs(el.currentTime - sourceTime) > 1 / 60) {
      this.seekTo(el, src, sourceTime);
    }

    // Not enough data buffered yet
    if (el.readyState < 2 /* HAVE_CURRENT_DATA */) return null;

    // Mid-seek — hold last frame
    if (this.seeking.has(src)) return null;

    return el;
  }

  private createElement(src: string): HTMLVideoElement {
    const el = document.createElement("video");
    el.src = src;
    el.preload = "auto";
    el.muted = true;
    el.playsInline = true;
    el.crossOrigin = "anonymous";
    return el;
  }

  private seekTo(el: HTMLVideoElement, src: string, time: number): void {
    this.seeking.add(src);
    el.currentTime = time;
    const onSeeked = () => {
      this.seeking.delete(src);
      el.removeEventListener("seeked", onSeeked);
      this.onFrame?.();
    };
    el.addEventListener("seeked", onSeeked);
  }

  /** Release all video elements. Call when the provider is no longer needed. */
  dispose(): void {
    for (const el of this.elements.values()) {
      el.src = "";
      el.load();
    }
    this.elements.clear();
    this.seeking.clear();
  }
}
