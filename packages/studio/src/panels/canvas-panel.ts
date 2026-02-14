import type { AtelierDocument } from "@atelier/types";
import { resolveFrame } from "@atelier/core";
import { renderFrame, ImageCache } from "@atelier/canvas";
import { Player } from "../player.js";

export interface CanvasPanelOptions {
  onFrameChange?: (frame: number) => void;
}

export class CanvasPanel {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player: Player | null = null;
  private playBtn: HTMLButtonElement;
  private scrubber: HTMLInputElement;
  private frameDisplay: HTMLSpanElement;
  private doc: AtelierDocument | null = null;
  private stateName = "";
  private imageCache: ImageCache;

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
    this.imageCache = new ImageCache({
      onLoad: () => this.refresh(),
      createImage: (src, onLoad, onError) => {
        const img = new Image();
        img.onload = onLoad;
        img.onerror = onError;
        img.src = src;
        return img;
      },
    });
    wrap.appendChild(this.canvas);
    this.el.appendChild(wrap);

    // Playback controls
    const playback = document.createElement("div");
    playback.className = "atel-playback";

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
      this.updatePlayBtn();
    });
    this.scrubber.addEventListener("input", () => {
      this.player?.seek(Number(this.scrubber.value));
    });
    this.scrubber.addEventListener("mouseup", () => {
      if (wasPlaying) {
        this.player?.play();
        this.updatePlayBtn();
      }
    });
  }

  loadDocument(doc: AtelierDocument, stateName?: string): void {
    this.doc = doc;
    this.stateName = stateName ?? Object.keys(doc.states)[0];
    const state = doc.states[this.stateName];
    if (!state) return;

    this.canvas.width = doc.canvas.width;
    this.canvas.height = doc.canvas.height;

    // Scale canvas to fit container
    const maxWidth = 500;
    if (doc.canvas.width > maxWidth) {
      const scale = maxWidth / doc.canvas.width;
      this.canvas.style.width = `${doc.canvas.width * scale}px`;
      this.canvas.style.height = `${doc.canvas.height * scale}px`;
    } else {
      this.canvas.style.width = "";
      this.canvas.style.height = "";
    }

    const totalFrames = state.duration;
    this.scrubber.max = String(totalFrames - 1);
    this.scrubber.value = "0";

    if (this.player) this.player.destroy();
    this.player = new Player(doc.canvas.fps, totalFrames, (f) => this.renderAt(f), true);

    this.renderAt(0);
    this.player.play();
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
    renderFrame(this.ctx as any, resolved, this.doc, this.imageCache);
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
    this.player?.toggle();
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

  destroy(): void {
    this.player?.destroy();
  }
}
