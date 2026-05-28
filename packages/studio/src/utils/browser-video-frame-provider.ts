/**
 * BrowserVideoFrameProvider — preview-mode VideoFrameProvider for the studio.
 *
 * Backs each video `src` with a lazy `HTMLVideoElement` and answers
 * `(src, sourceTime, w, h) → HTMLVideoElement | null` calls from the canvas
 * renderer. The export pipeline uses a Mediabunny/WebCodecs-backed provider
 * for deterministic frame extraction; this one is the live editor's pair.
 *
 * TWO MODES — controlled by `setPlaying()`:
 *
 *   PAUSED / SCRUBBING (default): seek-on-divergence. When the requested
 *     sourceTime moves beyond SEEK_EPSILON_S from the last asked-for time,
 *     issue `currentTime = sourceTime` and return null. The async `seeked`
 *     event fires `onReady` so canvas-panel re-paints with the freshly
 *     decoded frame. Without this, drawing a scrub would smear stale pixels.
 *
 *   PLAYING: native `video.play()` drives frame advance. Per-tick seeks are
 *     SKIPPED entirely — drawImage always grabs whatever frame the video has
 *     currently decoded. This is the only sustainable way to do 30fps video
 *     in a canvas; per-frame seeks at 30fps would race the seeked-event
 *     callback against the next tick (~33ms), producing the choppy
 *     "few-frames-then-skip" pattern owner saw before this lived. Audio plays
 *     unmuted in this mode — Play is a user gesture so Chrome permits it.
 *
 * Why a class (not a stateless function):
 *   - We must reuse the same HTMLVideoElement per src across calls; creating
 *     one per render tick would re-download the file every paint.
 *   - We need to debounce `currentTime` seeks during scrubbing.
 *   - We need to flip between play/pause/seek modes coherently.
 *
 * Threshold tuning:
 *   - 16ms (≈ one frame at 60fps) is the "close enough" window for skipping a
 *     re-seek. Below this we trust the already-decoded frame; above this we
 *     issue a fresh seek. Tighter would thrash; looser would visibly lag.
 *
 * Cache lifetime (module-level, see VIDEO_CACHE):
 *   - The cache is MODULE-LEVEL keyed by RESOLVED url, NOT per-provider —
 *     workspace-app rebuilds AtelierStudio (and therefore CanvasPanel and
 *     this provider) every time the user opens a doc, and during initial
 *     mount the workspace lifecycle disposes + re-creates the studio several
 *     times for layout settle. If each provider owned its own cache, every
 *     dispose() would call video.removeAttribute('src') + load(), aborting
 *     the in-flight 87MB MOV fetch and forcing a re-download on the next
 *     mount. Module-level caching means the SAME <video> element survives
 *     across provider lifetimes, the partial download continues uninterrupted,
 *     and dispose() becomes a no-op for the video itself. Memory cost: one
 *     detached HTMLVideoElement per UNIQUE resolved URL for the page lifetime
 *     — bounded by media usage.
 *   - Listeners are per-provider though (the onReady callback is): we attach
 *     in `attachListeners()` on get(), and detach in `dispose()` so a stale
 *     provider's onReady doesn't fire into a destroyed canvas-panel.
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

/**
 * Module-level cache, keyed by the RESOLVED url (post srcResolver). Survives
 * BrowserVideoFrameProvider instances so workspace-app's rebuild cascade
 * doesn't waste bandwidth re-fetching the same source on every doc-open
 * cycle. See class-level docstring for the rationale.
 */
const VIDEO_CACHE = new Map<string, VideoEntry>();

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

/**
 * Drift tolerance for play-mode sync. If the requested sourceTime differs
 * from the video's actual currentTime by more than this, we issue a one-shot
 * sync seek to re-anchor (e.g. after a loop wrap, or when the player and
 * video clock drift over a long playback). Set generously (250ms) so normal
 * decode lag never triggers a thrash — only real loss-of-sync events.
 */
const PLAY_SYNC_TOLERANCE_S = 0.25;

export class BrowserVideoFrameProvider {
  private srcResolver: (src: string) => string;
  private onReady: (() => void) | undefined;
  /** Per-provider listener registrations so dispose() can detach cleanly. */
  private listeners: Array<{ video: HTMLVideoElement; handler: () => void }> = [];
  /** Mode flag — switched by setPlaying(). See top-of-file mode docs. */
  private playing = false;

  constructor(opts: BrowserVideoFrameProviderOptions = {}) {
    this.srcResolver = opts.srcResolver ?? ((s) => s);
    this.onReady = opts.onReady;
  }

  /**
   * Toggle between PAUSED/SCRUBBING and PLAYING mode.
   *
   *   true  → unmute every cached video, call video.play() so native decode
   *           drives frame advance, set video.loop=true so a Player-side loop
   *           doesn't desync (both Player.frame and video.currentTime wrap
   *           independently to 0). Per-tick seeks in get() are bypassed.
   *
   *   false → video.pause() on every cached video and re-mute. Per-tick seeks
   *           resume so scrubbing the timeline feels live.
   *
   * Must be called from a user-gesture handler the first time (e.g. inside
   * the Play button's click handler) — otherwise Chrome's autoplay policy
   * silently rejects the play() call for unmuted audio. CanvasPanel wires
   * this from its `playBtn.click` listener and from `Space` keypress.
   */
  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    for (const entry of VIDEO_CACHE.values()) {
      if (playing) {
        entry.video.muted = false;
        entry.video.loop = true;
        // play() returns a Promise that may reject if autoplay is blocked.
        // Catch and re-mute so we don't crash; the user can re-press Play
        // after granting permission. Without the catch, an unhandled
        // promise rejection bubbles into the console as a red error.
        void entry.video.play().catch(() => {
          entry.video.muted = true;
          // Retry muted — at least the visuals will advance even if audio
          // permission was denied. Better than a frozen first frame.
          void entry.video.play().catch(() => { /* give up silently */ });
        });
      } else {
        entry.video.pause();
        entry.video.muted = true;
      }
    }
  }

  /**
   * Explicit one-shot sync — used by canvas-panel when the Player wraps to
   * a new frame (e.g. seek during pause, or loop wrap from end-of-clip back
   * to 0). Aligns the video's currentTime to the new sourceTime so the next
   * native-decoded frame matches the composition's intent.
   */
  syncTo(src: string, sourceTime: number): void {
    const resolved = this.srcResolver(src);
    const entry = VIDEO_CACHE.get(resolved);
    if (!entry || !entry.ready) return;
    if (Math.abs(entry.video.currentTime - sourceTime) <= SEEK_EPSILON_S) return;
    entry.requestedTime = sourceTime;
    try { entry.video.currentTime = sourceTime; } catch { /* swallow OOB */ }
  }

  /**
   * Provider signature matching `VideoFrameProvider` in @a-company/atelier-canvas.
   * Bound version is what gets handed to `renderFrame({ videoFrameProvider })`.
   */
  get = (src: string, sourceTime: number, _w: number, _h: number): HTMLVideoElement | null => {
    const resolved = this.srcResolver(src);
    let entry = VIDEO_CACHE.get(resolved);
    if (!entry) {
      entry = this.create(resolved);
      VIDEO_CACHE.set(resolved, entry);
      return null; // first call — wait for loadeddata → onReady → re-paint
    }
    // Cache hit from a prior provider lifetime — ensure THIS provider's
    // onReady fires on future readiness events. Idempotent via attachListeners.
    this.attachListeners(entry.video);
    if (!entry.ready) return null;

    // PLAYING mode: trust native decode. Only issue a sync seek when drift
    // exceeds PLAY_SYNC_TOLERANCE_S (a Player-side seek, loop wrap, or long
    // playback drift). Otherwise return the video — drawImage paints whatever
    // frame is currently decoded. This is the only way to get smooth 30fps
    // playback; per-tick seeks fight the seeked-event callback and produce
    // the visible "few frames then skip" chop.
    if (this.playing) {
      if (Math.abs(entry.video.currentTime - sourceTime) > PLAY_SYNC_TOLERANCE_S) {
        entry.requestedTime = sourceTime;
        try { entry.video.currentTime = sourceTime; } catch { /* swallow OOB */ }
      }
      return entry.video;
    }

    // PAUSED / SCRUBBING: clamp + seek if the requested time moved beyond the
    // epsilon window. We compare against requestedTime (what we LAST asked
    // for), not the video's own currentTime — the latter may not have caught
    // up if a seek is still in flight, and we'd spuriously re-issue the same
    // seek.
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

  /**
   * Detach THIS provider's listeners from the shared video elements. The
   * video elements themselves stay alive in VIDEO_CACHE for the next
   * provider to reuse — that's the whole point of module-level caching.
   * If you genuinely need to free a specific video (e.g. media was deleted),
   * see `evictFromCache` below. Also pauses any playing videos so a stale
   * provider doesn't leave audio running into a destroyed canvas-panel.
   */
  dispose(): void {
    if (this.playing) {
      for (const entry of VIDEO_CACHE.values()) {
        entry.video.pause();
        entry.video.muted = true;
      }
      this.playing = false;
    }
    for (const { video, handler } of this.listeners) {
      video.removeEventListener("loadeddata", handler);
      video.removeEventListener("seeked", handler);
    }
    this.listeners = [];
    this.onReady = undefined;
  }

  private create(resolved: string): VideoEntry {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    const entry: VideoEntry = { video, requestedTime: 0, ready: false };

    // Listen BEFORE setting src so we don't miss the loadeddata fire that
    // happens synchronously on cached responses.
    this.attachListeners(video, entry);
    video.src = resolved;
    video.load();
    return entry;
  }

  /**
   * Idempotent listener wiring — bookkeeping via `this.listeners` so dispose()
   * can detach exactly what was attached. If the video already had this
   * provider's listener (re-attach attempt within the same provider), no-op.
   */
  private attachListeners(video: HTMLVideoElement, entry?: VideoEntry): void {
    if (this.listeners.some((l) => l.video === video)) return;
    const cached = entry ?? VIDEO_CACHE.get(video.src);
    const handler = (): void => {
      if (cached && !cached.ready) cached.ready = true;
      this.onReady?.();
    };
    video.addEventListener("loadeddata", handler);
    video.addEventListener("seeked", handler);
    this.listeners.push({ video, handler });
  }
}

/**
 * Evict a specific cached video — call when the underlying media file has
 * been deleted or replaced so the next get() re-fetches. Useful for
 * workspace media-rename / media-delete flows. Returns true if a cached
 * entry was evicted, false if no cache entry existed.
 */
export function evictFromCache(resolved: string): boolean {
  const entry = VIDEO_CACHE.get(resolved);
  if (!entry) return false;
  entry.video.removeAttribute("src");
  entry.video.load();
  VIDEO_CACHE.delete(resolved);
  return true;
}
