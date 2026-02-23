import type { Fill, LinearGradientFill, RadialGradientFill, Color, RGBAColor, HSLAColor } from "@a-company/atelier-types";

let gradientIdCounter = 0;

export function resetGradientCounter(): void {
  gradientIdCounter = 0;
}

/** Convert an Atelier Color to a CSS color string */
export function colorToCSS(color: Color): string {
  if (typeof color === "string") return color;
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

/** Generate SVG gradient defs and return the fill reference */
export function buildGradientDef(fill: Fill, width: number, height: number): { defs: string; fillRef: string } {
  if (fill.type === "solid") {
    return { defs: "", fillRef: colorToCSS(fill.color) };
  }

  if (fill.type === "linear-gradient") {
    return buildLinearGradient(fill, width, height);
  }

  if (fill.type === "radial-gradient") {
    return buildRadialGradient(fill, width, height);
  }

  return { defs: "", fillRef: "none" };
}

function buildLinearGradient(fill: LinearGradientFill, _width: number, _height: number): { defs: string; fillRef: string } {
  const id = `grad-${++gradientIdCounter}`;
  const rad = (fill.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Map angle to x1,y1,x2,y2 (0-1 percentages)
  const x1 = 0.5 - cos * 0.5;
  const y1 = 0.5 - sin * 0.5;
  const x2 = 0.5 + cos * 0.5;
  const y2 = 0.5 + sin * 0.5;

  const stops = fill.stops.map(s =>
    `<stop offset="${s.offset}" stop-color="${colorToCSS(s.color)}" />`
  ).join("");

  const def = `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
  return { defs: def, fillRef: `url(#${id})` };
}

function buildRadialGradient(fill: RadialGradientFill, width: number, height: number): { defs: string; fillRef: string } {
  const id = `grad-${++gradientIdCounter}`;

  const cx = typeof fill.center.x === "number" ? fill.center.x : (parseFloat(fill.center.x) / 100) * width;
  const cy = typeof fill.center.y === "number" ? fill.center.y : (parseFloat(fill.center.y) / 100) * height;
  const r = typeof fill.radius === "number" ? fill.radius : (parseFloat(fill.radius) / 100) * Math.max(width, height);

  const stops = fill.stops.map(s =>
    `<stop offset="${s.offset}" stop-color="${colorToCSS(s.color)}" />`
  ).join("");

  const def = `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">${stops}</radialGradient>`;
  return { defs: def, fillRef: `url(#${id})` };
}
