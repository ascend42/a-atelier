/**
 * BrowserVideoFrameProvider — preview-mode VideoFrameProvider for the studio.
 *
 * Backs each video `src` with a lazy `HTMLVideoElement` and answers
 * `(src, sourceTime, w, h) → HTMLVideoElement | null` calls from the canvas
 * renderer. The export pipeline uses a Mediabunny/WebCodecs-backed provider
 * for deterministic frame extraction; this one is the live editor's pair.
 *
 * Why a class (not a stateless function):
 *   - We must reuse the same HTMLVideoElement per src across calls; creating
 *     one per render tick would re-download the file every paint.
 *   - We need to debounce `currentTime` seeks — Canvas2D's `drawImage` of a
 *     <video> draws the LAST seeked frame, so naive every-tick seeks leave
 *     drawImage drawing stale pixels until the asynchronous `seeked` event
 *     resolves. We hold the request, seek, return null, and notify the
 *     canvas-panel via `onReady` when the new frame is actually decoded.
 *
 * Threshold tuning:
 *   - 16ms (≈ one frame at 60fps) is the "close enough" window for skipping a
 *     re-seek. Below this we trust the already-decoded frame; above this we
 *     issue a fresh seek. Tighter would thrash; looser would visibly lag.
 *
 * Lifecycle:
 *   - Each video element is muted + playsInline + crossOrigin="anonymous" so
 *     it can be drawn to a canvas without taint and without forcing audio.
 *   - `dispose()` removes elements + listeners so studio teardown is clean
 *     (no GC leak via dangling DOM nodes during doc swaps).
 *
 * URL resolution is the CALLER's job — pass `srcResolver` to turn a relative
 * doc-stored path like `media/IMG_7346.MOV` into a fetchable URL like
 * `/api/file?path=creator/demo/media/IMG_7346.MOV`. Defaults to identity so
 * absolute / data URLs pass through unchanged.
 */

interface VideoEntry {
  video: HTMLVideoElement;
  /** Last currentTime we ASKED for — distinct from video.currentTime, which lags. */
  requestedTime: number;
  /** True once metadata loaded — before this drawImage shows nothing. */
  ready: boolean;
}

export interface BrowserVideoFrameProviderOptions {
  /**
   * Map a doc-stored video `src` (typically a relative path like
   * `media/IMG_7346.MOV`) to a URL the browser can fetch. Defaults to
   * identity. Pass workspace's `/api/file?path=…` builder here.
   */
  srcResolver?: (src: string) => string;
  /**
   * Fired when a video transitions from "not ready" to "ready", and after
   * every seek completes. Canvas-panel hooks this to re-draw so the freshly
   * decoded frame paints — without it, the first paint shows a black hole
   * even after the file has loaded.
   */
  onReady?: () => void;
}

/**
 * Close-enough seek threshold in seconds. One 60fps frame ≈ 0.0166s; anything
 * tighter would re-seek every tick during playback even when the video is
 * already at the right time.
 */
const SEEK_EPSILON_S = 0.016;

export class BrowserVideoFrameProvider {
  private entries = new Map<string, VideoEntry>();
  private srcResolver: (src: string) => string;
  private onReady: (() => void) | undefined;

  constructor(opts: BrowserVideoFrameProviderOptions = {}) {
    this.srcResolver = opts.srcResolver ?? ((s) => s);
    this.onReady = opts.onReady;
  }

  /**
   * Provider signature matching `VideoFrameProvider` in @a-company/atelier-canvas.
   * Bound version is what gets handed to `renderFrame({ videoFrameProvider })`.
   */
  get = (src: string, sourceTime: number, _w: number, _h: number): HTMLVideoElement | null => {
    let entry = this.entries.get(src);
    if (!entry) {
      entry = this.create(src);
      this.entries.set(src, entry);
      return null; // first call — wait for loadeddata → onReady → re-paint
    }
    if (!entry.ready) return null;

    // Clamp + seek if the requested time moved beyond the epsilon window. We
    // compare against requestedTime (what we LAST asked for), not the video's
    // own currentTime — the latter may not have caught up if a seek is still
    // in flight, and we'd spuriously re-issue the same seek.
    if (Math.abs(sourceTime - entry.requestedTime) > SEEK_EPSILON_S) {
      entry.requestedTime = sourceTime;
      try {
        entry.video.currentTime = sourceTime;
      } catch {
        // Some browsers throw if the time is out of range mid-load; the
        // seeked handler still fires on the eventual re-seek so we can
        // safely swallow.
      }
      // Don't draw the stale frame — wait for `seeked` to fire onReady.
      return null;
    }
    return entry.video;
  };

  /** Drop all cached video elements (call on doc unload / studio teardown). */
  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.video.removeAttribute("src");
      entry.video.load(); // forces the media element to release its source
    }
    this.entries.clear();
  }

  private create(src: string): VideoEntry {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    const entry: VideoEntry = { video, requestedTime: 0, ready: false };

    const markReady = (): void => {
      if (!entry.ready) entry.ready = true;
      this.onReady?.();
    };
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("seeked", markReady);

    video.src = this.srcResolver(src);
    video.load();
    return entry;
  }
}
