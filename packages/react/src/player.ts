import type { AtelierDocument } from "@atelier/types";
import { resolveFrame } from "@atelier/core";
import { renderFrame, ImageCache } from "@atelier/canvas";
import type { RenderContext } from "@atelier/canvas";

export interface PlayerOptions {
  autoplay?: boolean;
  loop?: boolean;
  onFrame?: (frame: number) => void;
  onComplete?: () => void;
}

/**
 * AnimationPlayer — manages requestAnimationFrame loop for Atelier animations.
 * Pure class, no React dependency — used by hooks internally.
 */
export class AnimationPlayer {
  private rafId: number | null = null;
  private lastTimestamp: number | null = null;
  private frameDuration: number;
  private _currentFrame = 0;
  private _isPlaying = false;
  private _currentState: string;
  private imageCache: ImageCache;

  constructor(
    private doc: AtelierDocument,
    private canvas: HTMLCanvasElement,
    private opts: PlayerOptions = {},
  ) {
    const stateNames = Object.keys(doc.states);
    this._currentState = stateNames[0] ?? "";
    this.frameDuration = 1000 / doc.canvas.fps;

    this.imageCache = new ImageCache({
      onLoad: () => this.renderCurrentFrame(),
      createImage: (src, onLoad, onError) => {
        const img = new Image();
        img.onload = onLoad;
        img.onerror = onError;
        img.src = src;
        return img;
      },
    });

    if (opts.autoplay !== false) {
      this.play();
    }
  }

  get currentFrame(): number {
    return this._currentFrame;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get duration(): number {
    const state = this.doc.states[this._currentState];
    return state ? state.duration : 0;
  }

  get currentState(): string {
    return this._currentState;
  }

  get stateNames(): string[] {
    return Object.keys(this.doc.states);
  }

  play(): void {
    if (this._isPlaying) return;
    this._isPlaying = true;
    this.lastTimestamp = null;
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this._isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  seek(frame: number): void {
    const maxFrame = this.duration - 1;
    this._currentFrame = Math.max(0, Math.min(frame, maxFrame));
    this.renderCurrentFrame();
  }

  setState(stateName: string): void {
    if (!this.doc.states[stateName]) {
      throw new Error(`State "${stateName}" not found`);
    }
    this._currentState = stateName;
    this._currentFrame = 0;
    this.renderCurrentFrame();
  }

  destroy(): void {
    this.pause();
  }

  /** Force render the current frame */
  renderCurrentFrame(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const resolved = resolveFrame(this.doc, this._currentState, this._currentFrame);
    renderFrame(ctx as unknown as RenderContext, resolved, this.doc, this.imageCache);
  }

  private tick = (timestamp: number): void => {
    if (!this._isPlaying) return;

    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
      this.renderCurrentFrame();
      this.opts.onFrame?.(this._currentFrame);
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    const elapsed = timestamp - this.lastTimestamp;
    if (elapsed >= this.frameDuration) {
      this.lastTimestamp = timestamp - (elapsed % this.frameDuration);

      const maxFrame = this.duration - 1;
      if (this._currentFrame >= maxFrame) {
        if (this.opts.loop) {
          this._currentFrame = 0;
        } else {
          this._isPlaying = false;
          this.opts.onComplete?.();
          return;
        }
      } else {
        this._currentFrame++;
      }

      this.renderCurrentFrame();
      this.opts.onFrame?.(this._currentFrame);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}
