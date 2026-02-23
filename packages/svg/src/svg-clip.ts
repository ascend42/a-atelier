import type { Shape } from "@a-company/atelier-types";

let clipIdCounter = 0;

export function resetClipCounter(): void {
  clipIdCounter = 0;
}

/** Build SVG clipPath definition */
export function buildClipPathDef(shape: Shape, width: number, height: number): { defs: string; clipRef: string } {
  const id = `clip-${++clipIdCounter}`;
  let pathContent = "";

  switch (shape.type) {
    case "rect":
      if (shape.cornerRadius) {
        const r = typeof shape.cornerRadius === "number" ? shape.cornerRadius : shape.cornerRadius[0];
        pathContent = `<rect width="${width}" height="${height}" rx="${r}" ry="${r}" />`;
      } else {
        pathContent = `<rect width="${width}" height="${height}" />`;
      }
      break;
    case "ellipse":
      pathContent = `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" />`;
      break;
    case "path": {
      if (shape.points.length < 2) return { defs: "", clipRef: "" };
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
      pathContent = `<path d="${d.join(" ")}" />`;
      break;
    }
  }

  const def = `<clipPath id="${id}">${pathContent}</clipPath>`;
  return { defs: def, clipRef: `url(#${id})` };
}
