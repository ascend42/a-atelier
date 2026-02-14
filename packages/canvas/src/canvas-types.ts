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

  // Path
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  fill(): void;
  stroke(): void;

  // Ellipse
  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number): void;

  // Rounded rect
  roundRect?(x: number, y: number, w: number, h: number, radii: number | number[]): void;

  // Text
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;

  // Style
  fillStyle: string | object;
  strokeStyle: string | object;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;

  // Line dash
  setLineDash(segments: number[]): void;
  lineDashOffset: number;

  // Gradient
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): GradientLike;

  // Canvas dimensions (for background fill)
  canvas: { width: number; height: number };
}

export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}
