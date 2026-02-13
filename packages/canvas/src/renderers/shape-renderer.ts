import type { ShapeVisual } from "@atelier/types";
import type { RenderContext } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";
import { applyFill, applyStroke } from "../styles.js";

export function renderShape(ctx: RenderContext, eff: EffectiveLayer): void {
  const visual = eff.layer.visual as ShapeVisual;
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
    applyStroke(ctx, visual.stroke);
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
    applyStroke(ctx, visual.stroke);
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
    applyStroke(ctx, visual.stroke);
    ctx.stroke();
  }
}
