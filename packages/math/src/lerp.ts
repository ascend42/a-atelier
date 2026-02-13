/**
 * Linear interpolation between two numbers.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Interpolate between two multi-dimensional values.
 * Arrays must be the same length.
 */
export function lerpArray(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => lerp(v, b[i], t));
}

/**
 * Re-maps a value from one range to another.
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const t = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, t);
}
