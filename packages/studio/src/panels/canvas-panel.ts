import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveFrame } from "@a-company/atelier-core";
import { renderFrame, ImageCache } from "@a-company/atelier-canvas";
import { Player } from "../player.js";
import { createImageLayerFromFile } from "../utils/image-drop.js";
import { BrowserVideoFrameProvider } from "../utils/browser-video-frame-provider.js";

export interface CanvasPanelOptions {
  onFrameChange?: (frame: number) => void;
  /**
   * If true, animation begins playback as soon as a document loads.
   * Default: false — the CLI studio editor never wants this (it fights the scrubber).
   * Showcase opts in by passing true.
   */
  autoplay?: boolean;
  /**
   * Invoked after a successful image drop mutates the document. The
   * studio shell uses this to trigger save + re-render across all panels
   * (same channel the layer-panel uses for `+ Add` operations).
   */
  onDocumentChange?: () => void;
  /**
   * Map a doc-stored relative `src` (e.g. `media/IMG_7346.MOV`) to a
   * browser-fetchable URL. Used by both the image cache and the video
   * frame provider; without this both fall back to identity, which means
   * relative-path layers from disk-loaded docs won't load. Workspace-app
   * supplies the `/api/file?path=…` builder so the studio doesn't have
   * to know about the file API surface.
   */
  srcResolver?: (src: string) => string;
}

/**
 * Compute the largest scale factor that fits `canvasW × canvasH` inside
 * `parentW × parentH` while preserving aspect ratio. Returns the scaled
 * pixel dimensions to apply to the canvas style.
 *
 * Edge cases — any non-positive dimension collapses to zero. Otherwise
 * pick the limiting axis (min of the two ratios) so the canvas always
 * fits AND keeps aspect; both up- and down-scaling are allowed (no
 * minimum/maximum clamp). The caller is responsible for clamping to
 * sane on-screen sizes if it wants to avoid scaling a tiny canvas to
 * the entire viewport.
 */
export function computeLetterboxFit(
  canvasW: number,
  canvasH: number,
  parentW: number,
  parentH: number,
): { width: number; height: number; scale: number } {
  if (canvasW <= 0 || canvasH <= 0 || parentW <= 0 || parentH <= 0) {
    return { width: 0, height: 0, scale: 0 };
  }
  const scale = Math.min(parentW / canvasW, parentH / canvasH);
  return { width: canvasW * scale, height: canvasH * scale, scale };
}

export class CanvasPanel {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player: Player | null = null;
  private playBtn: HTMLButtonElement;
  private playback: HTMLDivElement;
  private scrubber: HTMLInputElement;
  private frameDisplay: HTMLSpanElement;
  private doc: AtelierDocument | null = null;
  private stateName = "";
  private imageCache: ImageCache;
  private videoProvider: BrowserVideoFrameProvider;
  private resizeObserver: ResizeObserver | undefined;

  constructor(parent: HTMLElement, private opts: CanvasPanelOptions = {}) {
    this.el = document.createElement("div");
    this.el.className = "atel-canvas-panel";

    // Canvas
    const wrap = document.createElement("div");
    wrap.className = "atel-canvas-wrap";
    this.canvas = document.createElement("canvas");
    this.canvas.width = 600;
    this.canvas.height = 400;
    this.ctx = this.canvas.getContext("2d")!;

    // Resolve relative doc-stored srcs to absolute, browser-fetchable URLs.
    // Used by BOTH the image cache and the video provider so the two stay in
    // lockstep; the host (workspace-app) constructs a `/api/file?path=…`
    // builder rooted at the loaded doc's directory.
    const srcResolver = opts.srcResolver ?? ((s: string): string => s);

    this.imageCache = new ImageCache({
      onLoad: () => this.refresh(),
      createImage: (src, onLoad, onError) => {
        const img = new Image();
        img.onload = onLoad;
        img.onerror = onError;
        img.src = srcResolver(src);
        return img;
      },
    });
    // Preview-mode VideoFrameProvider — pairs with renderFrame's
    // videoFrameProvider option so VideoVisual layers actually paint in the
    // editor. The export path (Mediabunny/WebCodecs) supplies its own
    // deterministic provider; this one is editor-only.
    this.videoProvider = new BrowserVideoFrameProvider({
      srcResolver,
      onReady: () => this.refresh(),
    });
    wrap.appendChild(this.canvas);
    this.el.appendChild(wrap);

    // ─── Drag-and-drop: image files onto the canvas ─────────────────
    //
    // Headline v1 workflow: user drags a photo onto the Studio canvas,
    // it becomes an ImageVisual layer sized-to-fit, centered, behind
    // existing overlays. Background-layer placeholders (id "background"
    // from the welcome scaffold) get replaced rather than stacked.
    //
    // The drop-target highlight is painted by adding a CSS class to the
    // canvas wrapper while a drag is hovering — styles.css defines the
    // visual cue (outline + subtle backdrop).
    const dropTarget = wrap;
    dropTarget.addEventListener("dragenter", (e) => {
      // Only respond to file drags, not in-app drags (layer reorder).
      if (!hasFileTypes(e.dataTransfer)) return;
      e.preventDefault();
      dropTarget.classList.add("atel-canvas--drop-target");
    });
    dropTarget.addEventListener("dragover", (e) => {
      if (!hasFileTypes(e.dataTransfer)) return;
      // preventDefault is required for the drop event to fire.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      dropTarget.classList.add("atel-canvas--drop-target");
    });
    dropTarget.addEventListener("dragleave", (e) => {
      // dragleave fires for every child element entered — only clear
      // the highlight when the cursor actually leaves the wrap.
      if (e.target === dropTarget) {
        dropTarget.classList.remove("atel-canvas--drop-target");
      }
    });
    dropTarget.addEventListener("drop", (e) => {
      e.preventDefault();
      dropTarget.classList.remove("atel-canvas--drop-target");
      void this.handleFileDrop(e.dataTransfer);
    });

    // Playback controls
    const playback = document.createElement("div");
    playback.className = "atel-playback";
    this.playback = playback;

    this.playBtn = document.createElement("button");
    this.playBtn.className = "atel-playback__btn";
    this.playBtn.textContent = "\u25B6";

    this.scrubber = document.createElement("input");
    this.scrubber.type = "range";
    this.scrubber.className = "atel-playback__scrubber";
    this.scrubber.min = "0";
    this.scrubber.max = "0";
    this.scrubber.value = "0";

    this.frameDisplay = document.createElement("span");
    this.frameDisplay.className = "atel-playback__frame";
    this.frameDisplay.textContent = "0 / 0";

    playback.appendChild(this.playBtn);
    playback.appendChild(this.scrubber);
    playback.appendChild(this.frameDisplay);
    this.el.appendChild(playback);

    parent.appendChild(this.el);

    // Events
    this.playBtn.addEventListener("click", () => this.togglePlay());

    let wasPlaying = false;
    this.scrubber.addEventListener("mousedown", () => {
      wasPlaying = this.player?.isPlaying ?? false;
      this.player?.pause();
      // Drop the provider into seek-mode + mute so the scrub paints
      // crisp seeked frames instead of fighting native playback.
      this.videoProvider.setPlaying(false);
      this.updatePlayBtn();
    });
    this.scrubber.addEventListener("input", () => {
      this.player?.seek(Number(this.scrubber.value));
    });
    this.scrubber.addEventListener("mouseup", () => {
      if (wasPlaying && this.player) {
        // Anchor the video to the player's scrubbed frame BEFORE flipping
        // back to native playback — otherwise video.play() resumes from
        // the last seeked target, ignoring where the scrubber landed.
        this.syncVideoLayersToFrame(this.player.frame);
        this.player.play();
        this.videoProvider.setPlaying(true);
        this.updatePlayBtn();
      }
    });

    // ─── Letterbox-fit on container resize ─────────────────────────
    //
    // The canvas's CSS dimensions are recomputed from the panel's
    // current available area whenever the panel resizes (window
    // resize, dock toggle, side-panel collapse). The raster
    // dimensions (`canvas.width / .height`) stay pinned to the
    // document's canvas size — only the display size changes.
    // Observing `this.el` (not the wrap) avoids a feedback loop:
    // the wrap shrink-fits the canvas, so observing it would either
    // never change or oscillate.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.doc) this.applyLetterboxFit();
      });
      this.resizeObserver.observe(this.el);
    }
  }

  loadDocument(doc: AtelierDocument, stateName?: string): void {
    this.doc = doc;
    this.stateName = stateName ?? Object.keys(doc.states)[0];
    const state = doc.states[this.stateName];
    if (!state) return;

    this.canvas.width = doc.canvas.width;
    this.canvas.height = doc.canvas.height;

    // Letterbox-fit the canvas display size to the panel's available
    // area. ResizeObserver keeps it in sync afterward, but a one-shot
    // call here paints the correct size on the very first frame
    // (before the observer's initial fire) so we don't flash at the
    // pre-doc default 600×400.
    this.applyLetterboxFit();

    const totalFrames = state.duration;
    this.scrubber.max = String(totalFrames - 1);
    this.scrubber.value = "0";

    if (this.player) this.player.destroy();
    this.player = new Player(doc.canvas.fps, totalFrames, (f) => this.renderAt(f), true);

    this.renderAt(0);
    if (this.opts.autoplay) {
      this.player.play();
      // Mirror togglePlay() — flip the provider into native-decode mode so
      // autoplay flows (showcase) get smooth video + audio too. Note that
      // unmuted autoplay without a user gesture will be silently rejected
      // by Chrome's autoplay policy and the provider's catch will fall
      // back to muted playback — visuals still advance.
      this.videoProvider.setPlaying(true);
      this.syncVideoLayersToFrame(0);
    }
    this.updatePlayBtn();
  }

  setStateName(name: string): void {
    if (!this.doc) return;
    this.stateName = name;
    const state = this.doc.states[name];
    if (!state) return;
    this.scrubber.max = String(state.duration - 1);
    this.scrubber.value = "0";
    this.player?.setTotalFrames(state.duration);
    this.player?.seek(0);
  }

  renderAt(frame: number): void {
    if (!this.doc) return;
    const resolved = resolveFrame(this.doc, this.stateName, frame);
    // RenderOptions object form (the old `imageCache` positional sentinel is
    // also supported, but only the options form carries videoFrameProvider —
    // without that, every VideoVisual layer silently no-ops via the
    // `if (videoFrameProvider)` guard in render-frame.ts, which is exactly
    // the bug that left the editor's canvas black on video docs.
    renderFrame(this.ctx as any, resolved, this.doc, {
      imageCache: this.imageCache,
      videoFrameProvider: this.videoProvider.get,
    });
    this.scrubber.value = String(frame);
    const total = this.doc.states[this.stateName]?.duration ?? 0;
    this.frameDisplay.textContent = `${frame} / ${total - 1}`;
    this.opts.onFrameChange?.(frame);
  }

  /** Re-render current frame (after doc mutation) */
  refresh(): void {
    if (!this.doc || !this.player) return;
    this.renderAt(this.player.frame);
  }

  togglePlay(): void {
    if (!this.player) return;
    this.player.toggle();
    // Hand the play/pause state to the video provider so it can switch
    // between native-decode-driven playback (smooth + audio) and
    // seek-on-divergence scrubbing. Must run AFTER player.toggle so we
    // pick up the new state. This is also the user-gesture entry point \u2014
    // Chrome's autoplay policy permits unmuted video.play() because the
    // call stack originates from a click/keypress.
    this.videoProvider.setPlaying(this.player.isPlaying);
    // Sync the video to the player's current frame so playback resumes
    // at the right position (not wherever video.currentTime happened to be).
    if (this.player.isPlaying) this.syncVideoLayersToFrame(this.player.frame);
    this.updatePlayBtn();
  }

  stepForward(): void {
    if (this.player) this.player.seek(this.player.frame + 1);
  }

  stepBack(): void {
    if (this.player) this.player.seek(Math.max(0, this.player.frame - 1));
  }

  private updatePlayBtn(): void {
    this.playBtn.textContent = this.player?.isPlaying ? "\u275A\u275A" : "\u25B6";
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getImageCache(): ImageCache {
    return this.imageCache;
  }

  pause(): void {
    this.player?.pause();
    // Flip the provider back to seek-mode + mute so audio stops the moment
    // playback ends, not whenever the next render tick lands.
    this.videoProvider.setPlaying(false);
    this.updatePlayBtn();
  }

  /**
   * Push the player's current frame into every VideoVisual layer's underlying
   * <video> element. Used at play-resume and at scrubber-mouseup to anchor
   * native playback to the doc-intended sourceTime \u2014 otherwise pressing Play
   * after scrubbing would resume from wherever video.currentTime happened to
   * be when paused (often the LAST seeked target, which lags the scrub).
   */
  private syncVideoLayersToFrame(frame: number): void {
    if (!this.doc) return;
    const fps = this.doc.canvas.fps;
    for (const layer of this.doc.layers) {
      if (layer.visual.type !== "video") continue;
      const v = layer.visual;
      const startFrame = v.startFrame ?? 0;
      const sourceOffset = v.sourceOffset ?? 0;
      const playbackRate = v.playbackRate ?? 1.0;
      const relFrame = Math.max(0, frame - startFrame);
      let sourceTime = (relFrame / fps) * playbackRate + sourceOffset;
      if (v.sourceEnd !== undefined) sourceTime = Math.min(sourceTime, v.sourceEnd);
      const src = v.src ?? (v.assetId && this.doc.assets?.[v.assetId]?.src) ?? null;
      if (src) this.videoProvider.syncTo(src, sourceTime);
    }
  }

  destroy(): void {
    this.player?.destroy();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    // Release cached <video> elements so doc swaps don't leak detached DOM
    // nodes that keep their decoders alive. ImageCache is GC'd via its own
    // closure refs; only the video provider owns persistent DOM.
    this.videoProvider.dispose();
  }

  /**
   * Recompute the canvas's CSS dimensions to letterbox-fit the panel's
   * current available area. Subtracts the panel padding, the playback
   * row, and the column gap from the panel's bounding rect so the
   * canvas never overflows into the playback lane (the visual bug
   * that caused tall portrait canvases to push text off-screen).
   *
   * The CSS pads/gap MUST stay in sync with .atel-canvas-panel in
   * styles.css — padding: 16px; gap: 12px.
   */
  private applyLetterboxFit(): void {
    if (!this.doc) return;
    const panelRect = this.el.getBoundingClientRect();
    const playbackH = this.playback.getBoundingClientRect().height;
    const padX = 16 * 2;
    const padY = 16 * 2;
    const gap = 12;
    const availW = panelRect.width - padX;
    const availH = panelRect.height - padY - playbackH - gap;
    const fit = computeLetterboxFit(
      this.doc.canvas.width,
      this.doc.canvas.height,
      availW,
      availH,
    );
    this.canvas.style.width = `${fit.width}px`;
    this.canvas.style.height = `${fit.height}px`;
  }

  /**
   * Process a drop event's DataTransfer: extract image files (silently
   * ignoring non-images), create a layer for each, and notify the host
   * once the document has actually mutated.
   *
   * The FIRST image gets `replaceBackground: true` so it swaps out the
   * welcome scaffold's placeholder; subsequent images stack normally.
   */
  private async handleFileDrop(dataTransfer: DataTransfer | null): Promise<void> {
    if (!this.doc || !dataTransfer) return;
    const files = Array.from(dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    let firstDrop = true;
    for (const file of files) {
      try {
        await createImageLayerFromFile(this.doc, file, { replaceBackground: firstDrop });
        firstDrop = false;
      } catch {
        // Skip files that fail to decode rather than aborting the whole
        // batch — a corrupt drop shouldn't lose the other valid drops.
        continue;
      }
    }

    // Notify the shell — its onDocChange path re-renders the canvas,
    // refreshes the layer/yaml panels, and triggers autosave.
    this.opts.onDocumentChange?.();
  }
}

/**
 * Quick check: does this DataTransfer carry files? We use the `types`
 * array (which is populated during dragover, unlike `files` which is
 * only filled at drop time).
 */
function hasFileTypes(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  for (let i = 0; i < dt.types.length; i++) {
    if (dt.types[i] === "Files") return true;
  }
  return false;
}
