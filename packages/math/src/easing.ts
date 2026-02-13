/**
 * Linear easing — no acceleration.
 */
export function linear(t: number): number {
  return t;
}

/**
 * Cubic bezier easing — CSS-compatible.
 * Implements the same algorithm as CSS cubic-bezier().
 * @param x1 - first control point x
 * @param y1 - first control point y
 * @param x2 - second control point x
 * @param y2 - second control point y
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  // Use binary search to find the parametric t value that gives us our x,
  // then compute the corresponding y. This is the standard algorithm used
  // by browsers for CSS transitions.

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    // Binary search for the parametric t value that gives us our x
    let lo = 0;
    let hi = 1;
    let mid: number = 0;

    for (let i = 0; i < 20; i++) {
      mid = (lo + hi) / 2;
      const x = sampleBezier(x1, x2, mid);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = mid;
      else hi = mid;
    }

    mid = (lo + hi) / 2;
    return sampleBezier(y1, y2, mid);
  };
}

/** Sample a single axis of a cubic bezier at parametric t */
function sampleBezier(p1: number, p2: number, t: number): number {
  // B(t) = 3(1-t)^2*t*p1 + 3(1-t)*t^2*p2 + t^3
  return 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
}

/** Common CSS easing presets */
export const easeIn = cubicBezier(0.42, 0, 1, 1);
export const easeOut = cubicBezier(0, 0, 0.58, 1);
export const easeInOut = cubicBezier(0.42, 0, 0.58, 1);

/**
 * Step easing — jumps between discrete values.
 * @param steps - number of steps
 * @param position - "start" or "end" (default "end")
 */
export function step(
  steps: number,
  position: "start" | "end" = "end",
): (t: number) => number {
  return (t: number): number => {
    if (t <= 0) return position === "start" ? 1 / steps : 0;
    if (t >= 1) return 1;

    const s = Math.floor(t * steps);
    if (position === "start") {
      return Math.min((s + 1) / steps, 1);
    }
    return s / steps;
  };
}
