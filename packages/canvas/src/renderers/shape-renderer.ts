import type { ShapeVisual } from "@atelier/types";
import type { RenderContext } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";
import { applyFill, applyStroke } from "../styles.js";

export function renderShape(ctx: RenderContext, eff: EffectiveLayer): void {
  const visual = eff.visual as ShapeVisual;
  const { shape } = visual;
  const { width, height } = eff;

  switch (shape.type) {
    case "rect":
      renderRect(ctx, width, height, shape.cornerRadius, visual);
      break;
    case "ellipse":
      renderEllipse(ctx, width, height, visual);
      break;
    case "path":
      renderPath(ctx, shape.points, shape.closed, visual);
      break;
  }
}

// ── Perimeter helpers ───────────────────────────────────────

function rectPerimeter(w: number, h: number): number {
  return 2 * (w + h);
}

function ellipsePerimeter(w: number, h: number): number {
  const a = w / 2;
  const b = h / 2;
  // Ramanujan approximation
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function pathPerimeter(
  points: { x: number; y: number; in?: { x: number; y: number }; out?: { x: number; y: number } }[],
  closed: boolean | undefined,
): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev.out && curr.in) {
      // Approximate bezier with chord * 1.2
      length += dist(prev.x, prev.y, curr.x, curr.y) * 1.2;
    } else {
      length += dist(prev.x, prev.y, curr.x, curr.y);
    }
  }
  if (closed && points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    length += dist(last.x, last.y, first.x, first.y);
  }
  return length;
}

// ── Renderers ───────────────────────────────────────────────

function renderRect(
  ctx: RenderContext,
  width: number,
  height: number,
  cornerRadius: number | [number, number, number, number] | undefined,
  visual: ShapeVisual,
): void {
  if (visual.fill) {
    applyFill(ctx, visual.fill, width, height);
    if (cornerRadius && ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, cornerRadius);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, width, height);
    }
  }
  if (visual.stroke) {
    const perimeter = rectPerimeter(width, height);
    applyStroke(ctx, visual.stroke, perimeter);
    if (cornerRadius && ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, cornerRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(0, 0, width, height);
    }
  }
}

function renderEllipse(
  ctx: RenderContext,
  width: number,
  height: number,
  visual: ShapeVisual,
): void {
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);

  if (visual.fill) {
    applyFill(ctx, visual.fill, width, height);
    ctx.fill();
  }
  if (visual.stroke) {
    const perimeter = ellipsePerimeter(width, height);
    applyStroke(ctx, visual.stroke, perimeter);
    ctx.stroke();
  }
}

function renderPath(
  ctx: RenderContext,
  points: { x: number; y: number; in?: { x: number; y: number }; out?: { x: number; y: number } }[],
  closed: boolean | undefined,
  visual: ShapeVisual,
): void {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    if (prev.out && curr.in) {
      ctx.bezierCurveTo(
        prev.x + prev.out.x, prev.y + prev.out.y,
        curr.x + curr.in.x, curr.y + curr.in.y,
        curr.x, curr.y,
      );
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }

  if (closed) ctx.closePath();

  if (visual.fill) {
    applyFill(ctx, visual.fill, 0, 0);
    ctx.fill();
  }
  if (visual.stroke) {
    const perimeter = pathPerimeter(points, closed);
    applyStroke(ctx, visual.stroke, perimeter);
    ctx.stroke();
  }
}
