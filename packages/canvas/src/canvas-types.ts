/**
 * Minimal Canvas 2D rendering context interface.
 * Only includes methods/properties used by the Atelier renderer.
 * Compatible with browser CanvasRenderingContext2D and node-canvas.
 */
export interface RenderContext {
  // State
  save(): void;
  restore(): void;

  // Transform
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;

  // Rect
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  /**
   * Reset every pixel in the rect to fully-transparent black, regardless of
   * compositing mode. Both CanvasRenderingContext2D and node-canvas's 2D
   * context expose this; we expose it on the abstraction so renderFrame can
   * truly wipe the canvas between frames (a `fillRect("transparent")` under
   * default source-over compositing is a no-op, which let the export's
   * caption layers accumulate frame-over-frame — bug caught in
   * animation (1).mp4 by owner on 2026-05-28).
   */
  clearRect(x: number, y: number, w: number, h: number): void;

  // Path
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;

  // Ellipse
  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number): void;

  // Rounded rect
  roundRect?(x: number, y: number, w: number, h: number, radii: number | number[]): void;

  // Text
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  strokeText(text: string, x: number, y: number): void;

  // Style
  fillStyle: string | object;
  strokeStyle: string | object;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  font: string;
  textAlign: string;
  textBaseline: string;

  // Shadow
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  // Image (5-arg: dest only, 9-arg: source + dest crop)
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
  drawImage(image: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;

  // Line dash
  setLineDash(segments: number[]): void;
  lineDashOffset: number;

  // Gradient
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): GradientLike;

  // Canvas dimensions (for background fill)
  canvas: { width: number; height: number };

  // Offscreen canvas for compositing effects (tinting). Optional — if unavailable, tint is skipped.
  createOffscreen?: (width: number, height: number) => { ctx: RenderContext; canvas: unknown };
}

export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}

/** Resolves a ref layer's src path to a loaded AtelierDocument */
export type DocumentResolver = (src: string) => import("@a-company/atelier-types").AtelierDocument | undefined;

/**
 * Provides a rendered video frame as a drawable image for a given source time.
 * Returns null if the frame isn't ready (caller skips draw and retries next tick).
 * Preview mode: backed by HTMLVideoElement.currentTime seeks.
 * Export mode: backed by Mediabunny/WebCodecs for deterministic frame extraction.
 * Return type is `object` to avoid DOM lib dependency — at runtime: HTMLVideoElement | ImageBitmap | HTMLCanvasElement.
 */
export type VideoFrameProvider = (
  src: string,
  sourceTime: number,
  width: number,
  height: number,
) => object | null;
