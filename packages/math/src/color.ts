import { lerp, clamp } from "./lerp.js";

export interface RGBA {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export interface HSLA {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
  a: number; // 0-1
}

/**
 * Parse a hex color string to RGBA.
 * Supports: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
 */
export function hexToRgba(hex: string): RGBA {
  let h = hex.replace("#", "");

  if (h.length === 3)
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + "ff";
  else if (h.length === 4)
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  else if (h.length === 6) h = h + "ff";

  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: parseInt(h.slice(6, 8), 16) / 255,
  };
}

/**
 * Convert RGBA to hex string.
 */
export function rgbaToHex(color: RGBA): string {
  const r = clamp(Math.round(color.r), 0, 255)
    .toString(16)
    .padStart(2, "0");
  const g = clamp(Math.round(color.g), 0, 255)
    .toString(16)
    .padStart(2, "0");
  const b = clamp(Math.round(color.b), 0, 255)
    .toString(16)
    .padStart(2, "0");
  const a = clamp(Math.round(color.a * 255), 0, 255)
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}${a === "ff" ? "" : a}`;
}

/**
 * Interpolate between two RGBA colors.
 */
export function lerpRgba(a: RGBA, b: RGBA, t: number): RGBA {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
    a: lerp(a.a, b.a, t),
  };
}

/**
 * Convert RGBA to HSLA.
 */
export function rgbaToHsla(color: RGBA): HSLA {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100, a: color.a };
}

/**
 * Convert HSLA to RGBA.
 */
export function hslaToRgba(color: HSLA): RGBA {
  const h = color.h / 360;
  const s = color.s / 100;
  const l = color.l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a: color.a,
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * Interpolate between two HSLA colors (shortest hue path).
 */
export function lerpHsla(a: HSLA, b: HSLA, t: number): HSLA {
  // Handle hue wrapping — take the shortest path
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;

  return {
    h: (((a.h + dh * t) % 360) + 360) % 360,
    s: lerp(a.s, b.s, t),
    l: lerp(a.l, b.l, t),
    a: lerp(a.a, b.a, t),
  };
}
