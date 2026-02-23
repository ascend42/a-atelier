import type { Color, RGBAColor, HSLAColor } from "@a-company/atelier-types";

/** Convert an Atelier color to Lottie [r, g, b, a] format (0–1 range) */
export function colorToLottie(color: Color): number[] {
  if (typeof color === "string") {
    return hexToLottie(color);
  }

  if ("r" in color) {
    const c = color as RGBAColor;
    return [c.r / 255, c.g / 255, c.b / 255, c.a];
  }

  if ("h" in color) {
    const c = color as HSLAColor;
    const rgb = hslToRgb(c.h, c.s, c.l);
    return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, c.a];
  }

  return [0, 0, 0, 1];
}

function hexToLottie(hex: string): number[] {
  const clean = hex.replace("#", "");
  if (clean.length === 3 || clean.length === 4) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    const a = clean.length === 4 ? parseInt(clean[3] + clean[3], 16) / 255 : 1;
    return [r, g, b, a];
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s = s / 100;
  l = l / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
