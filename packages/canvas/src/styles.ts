import type { Fill, Stroke, Color, RGBAColor, HSLAColor } from "@a-company/atelier-types";
import type { RenderContext } from "./canvas-types.js";

/**
 * Convert an Atelier Color to a CSS color string.
 */
export function colorToCSS(color: Color): string {
  if (typeof color === "string") return color; // hex string

  if ("r" in color) {
    const c = color as RGBAColor;
    return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`;
  }

  if ("h" in color) {
    const c = color as HSLAColor;
    return `hsla(${c.h}, ${c.s}%, ${c.l}%, ${c.a})`;
  }

  return "#000000";
}

/**
 * Apply a Fill to the canvas context's fillStyle.
 */
export function applyFill(ctx: RenderContext, fill: Fill, width: number, height: number): void {
  switch (fill.type) {
    case "solid":
      ctx.fillStyle = colorToCSS(fill.color);
      break;

    case "linear-gradient": {
      const rad = (fill.angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const halfW = width / 2;
      const halfH = height / 2;
      const grad = ctx.createLinearGradient(
        halfW - cos * halfW, halfH - sin * halfH,
        halfW + cos * halfW, halfH + sin * halfH,
      );
      for (const stop of fill.stops) {
        grad.addColorStop(stop.offset, colorToCSS(stop.color));
      }
      ctx.fillStyle = grad as unknown as string;
      break;
    }

    case "radial-gradient": {
      const cx = typeof fill.center.x === "number" ? fill.center.x : (parseFloat(fill.center.x) / 100) * width;
      const cy = typeof fill.center.y === "number" ? fill.center.y : (parseFloat(fill.center.y) / 100) * height;
      const r = typeof fill.radius === "number" ? fill.radius : (parseFloat(fill.radius) / 100) * Math.max(width, height);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      for (const stop of fill.stops) {
        grad.addColorStop(stop.offset, colorToCSS(stop.color));
      }
      ctx.fillStyle = grad as unknown as string;
      break;
    }
  }
}

/**
 * Apply a Stroke to the canvas context.
 * @param pathLength - total perimeter of the shape (needed for strokeStart/strokeEnd trim)
 */
export function applyStroke(ctx: RenderContext, stroke: Stroke, pathLength: number): void {
  ctx.strokeStyle = colorToCSS(stroke.color);
  ctx.lineWidth = stroke.width;
  if (stroke.lineCap) ctx.lineCap = stroke.lineCap;
  if (stroke.lineJoin) ctx.lineJoin = stroke.lineJoin;

  const start = stroke.strokeStart ?? 0;
  const end = stroke.strokeEnd ?? 1;

  if (start !== 0 || end !== 1) {
    const visible = (end - start) * pathLength;
    ctx.setLineDash([Math.max(visible, 0), pathLength + 1]);
    ctx.lineDashOffset = -start * pathLength;
  } else if (stroke.dash) {
    ctx.setLineDash(stroke.dash);
  }
}
