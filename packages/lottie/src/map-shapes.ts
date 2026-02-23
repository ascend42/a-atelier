import type { ShapeVisual, Fill, Stroke } from "@a-company/atelier-types";
import type { LottieShapeItem } from "./lottie-types.js";
import { colorToLottie } from "./map-colors.js";

/** Map an Atelier shape visual to Lottie shape items */
export function mapShapeVisual(
  visual: ShapeVisual,
  width: number,
  height: number,
): LottieShapeItem[] {
  const items: LottieShapeItem[] = [];

  // Shape geometry
  switch (visual.shape.type) {
    case "rect":
      items.push({
        ty: "rc",
        nm: "Rectangle",
        d: 1,
        s: { a: 0, k: [width, height] },
        p: { a: 0, k: [width / 2, height / 2] },
        r: { a: 0, k: typeof visual.shape.cornerRadius === "number" ? visual.shape.cornerRadius : 0 },
      });
      break;
    case "ellipse":
      items.push({
        ty: "el",
        nm: "Ellipse",
        d: 1,
        s: { a: 0, k: [width, height] },
        p: { a: 0, k: [width / 2, height / 2] },
      });
      break;
    case "path": {
      const vertices = visual.shape.points.map(p => [p.x, p.y]);
      const inTangents = visual.shape.points.map(p => p.in ? [p.in.x, p.in.y] : [0, 0]);
      const outTangents = visual.shape.points.map(p => p.out ? [p.out.x, p.out.y] : [0, 0]);
      items.push({
        ty: "sh",
        nm: "Path",
        ks: {
          a: 0,
          k: {
            c: visual.shape.closed ?? false,
            v: vertices,
            i: inTangents,
            o: outTangents,
          },
        },
      });
      break;
    }
  }

  // Fill
  if (visual.fill) {
    items.push(mapFill(visual.fill, width, height));
  }

  // Stroke
  if (visual.stroke) {
    items.push(mapStroke(visual.stroke));
  }

  return items;
}

function mapFill(fill: Fill, _width: number, _height: number): LottieShapeItem {
  if (fill.type === "solid") {
    const color = colorToLottie(fill.color);
    return {
      ty: "fl",
      nm: "Fill",
      c: { a: 0, k: color.slice(0, 3) },
      o: { a: 0, k: (color[3] ?? 1) * 100 },
      r: 1,
    };
  }

  if (fill.type === "linear-gradient") {
    const stops: number[] = [];
    for (const stop of fill.stops) {
      const c = colorToLottie(stop.color);
      stops.push(stop.offset, c[0], c[1], c[2]);
    }
    return {
      ty: "gf",
      nm: "Gradient Fill",
      t: 1, // linear
      s: { a: 0, k: [0, 0] },
      e: { a: 0, k: [100, 0] },
      g: { p: fill.stops.length, k: { a: 0, k: stops } },
      r: 1,
      o: { a: 0, k: 100 },
    };
  }

  if (fill.type === "radial-gradient") {
    const stops: number[] = [];
    for (const stop of fill.stops) {
      const c = colorToLottie(stop.color);
      stops.push(stop.offset, c[0], c[1], c[2]);
    }
    return {
      ty: "gf",
      nm: "Gradient Fill",
      t: 2, // radial
      s: { a: 0, k: [50, 50] },
      e: { a: 0, k: [100, 50] },
      g: { p: fill.stops.length, k: { a: 0, k: stops } },
      r: 1,
      o: { a: 0, k: 100 },
    };
  }

  return { ty: "fl", nm: "Fill", c: { a: 0, k: [0, 0, 0] }, o: { a: 0, k: 100 }, r: 1 };
}

function mapStroke(stroke: Stroke): LottieShapeItem {
  const color = colorToLottie(stroke.color);
  return {
    ty: "st",
    nm: "Stroke",
    c: { a: 0, k: color.slice(0, 3) },
    o: { a: 0, k: (color[3] ?? 1) * 100 },
    w: { a: 0, k: stroke.width },
    lc: stroke.lineCap === "round" ? 2 : stroke.lineCap === "square" ? 3 : 1,
    lj: stroke.lineJoin === "round" ? 2 : stroke.lineJoin === "bevel" ? 3 : 1,
  };
}
