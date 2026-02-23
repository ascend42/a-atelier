import type { ShapeVisual, Shape, RectShape, PathShape, Stroke } from "@atelier/types";
import type { EffectiveLayer } from "@atelier/canvas";
import { buildGradientDef, colorToCSS } from "./svg-gradients.js";

/** Render a shape visual as SVG elements */
export function renderShapeSVG(
  eff: EffectiveLayer,
  visual: ShapeVisual,
): { elements: string; defs: string } {
  const { shape } = visual;
  const defs: string[] = [];

  let fillAttr = "none";
  if (visual.fill) {
    const gradResult = buildGradientDef(visual.fill, eff.width, eff.height);
    if (gradResult.defs) defs.push(gradResult.defs);
    fillAttr = gradResult.fillRef;
  }

  let strokeAttrs = "";
  if (visual.stroke) {
    strokeAttrs = buildStrokeAttrs(visual.stroke);
  }

  const element = buildShapeElement(shape, eff.width, eff.height, fillAttr, strokeAttrs);
  return { elements: element, defs: defs.join("") };
}

function buildShapeElement(
  shape: Shape,
  width: number,
  height: number,
  fill: string,
  strokeAttrs: string,
): string {
  switch (shape.type) {
    case "rect":
      return buildRectElement(shape, width, height, fill, strokeAttrs);
    case "ellipse":
      return buildEllipseElement(width, height, fill, strokeAttrs);
    case "path":
      return buildPathElement(shape, fill, strokeAttrs);
  }
}

function buildRectElement(
  shape: RectShape,
  width: number,
  height: number,
  fill: string,
  strokeAttrs: string,
): string {
  let rx = "";
  if (shape.cornerRadius) {
    const r = typeof shape.cornerRadius === "number" ? shape.cornerRadius : shape.cornerRadius[0];
    rx = ` rx="${r}" ry="${r}"`;
  }
  return `<rect width="${width}" height="${height}" fill="${fill}"${rx}${strokeAttrs ? " " + strokeAttrs : ""} />`;
}

function buildEllipseElement(
  width: number,
  height: number,
  fill: string,
  strokeAttrs: string,
): string {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${strokeAttrs ? " " + strokeAttrs : ""} />`;
}

function buildPathElement(
  shape: PathShape,
  fill: string,
  strokeAttrs: string,
): string {
  if (shape.points.length < 2) return "";

  const d: string[] = [];
  d.push(`M ${shape.points[0].x} ${shape.points[0].y}`);

  for (let i = 1; i < shape.points.length; i++) {
    const prev = shape.points[i - 1];
    const curr = shape.points[i];

    if (prev.out && curr.in) {
      d.push(`C ${prev.x + prev.out.x} ${prev.y + prev.out.y} ${curr.x + curr.in.x} ${curr.y + curr.in.y} ${curr.x} ${curr.y}`);
    } else {
      d.push(`L ${curr.x} ${curr.y}`);
    }
  }

  if (shape.closed) d.push("Z");

  return `<path d="${d.join(" ")}" fill="${fill}"${strokeAttrs ? " " + strokeAttrs : ""} />`;
}

function buildStrokeAttrs(stroke: Stroke): string {
  const parts: string[] = [];
  parts.push(`stroke="${colorToCSS(stroke.color)}"`);
  parts.push(`stroke-width="${stroke.width}"`);

  if (stroke.lineCap) parts.push(`stroke-linecap="${stroke.lineCap}"`);
  if (stroke.lineJoin) parts.push(`stroke-linejoin="${stroke.lineJoin}"`);
  if (stroke.dash) parts.push(`stroke-dasharray="${stroke.dash.join(" ")}"`);

  return parts.join(" ");
}
