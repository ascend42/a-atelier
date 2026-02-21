/**
 * Path interpolation utilities for motion paths.
 * Evaluates position and tangent along a path defined by points with bezier handles.
 */

export interface PathPoint2D {
  x: number;
  y: number;
  in?: { x: number; y: number };
  out?: { x: number; y: number };
}

export interface PathPosition {
  x: number;
  y: number;
  /** Tangent angle in degrees */
  angle: number;
}

/**
 * Compute the length of a single cubic bezier segment using subdivision.
 */
function bezierSegmentLength(
  p0x: number, p0y: number,
  c0x: number, c0y: number,
  c1x: number, c1y: number,
  p1x: number, p1y: number,
  steps = 32,
): number {
  let length = 0;
  let prevX = p0x;
  let prevY = p0y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * mt * p0x + 3 * mt * mt * t * c0x + 3 * mt * t * t * c1x + t * t * t * p1x;
    const y = mt * mt * mt * p0y + 3 * mt * mt * t * c0y + 3 * mt * t * t * c1y + t * t * t * p1y;
    const dx = x - prevX;
    const dy = y - prevY;
    length += Math.sqrt(dx * dx + dy * dy);
    prevX = x;
    prevY = y;
  }
  return length;
}

/**
 * Evaluate a cubic bezier at parameter t, returning position and tangent.
 */
function evalBezier(
  p0x: number, p0y: number,
  c0x: number, c0y: number,
  c1x: number, c1y: number,
  p1x: number, p1y: number,
  t: number,
): PathPosition {
  const mt = 1 - t;
  const x = mt * mt * mt * p0x + 3 * mt * mt * t * c0x + 3 * mt * t * t * c1x + t * t * t * p1x;
  const y = mt * mt * mt * p0y + 3 * mt * mt * t * c0y + 3 * mt * t * t * c1y + t * t * t * p1y;

  // Tangent (first derivative)
  const tx = 3 * mt * mt * (c0x - p0x) + 6 * mt * t * (c1x - c0x) + 3 * t * t * (p1x - c1x);
  const ty = 3 * mt * mt * (c0y - p0y) + 6 * mt * t * (c1y - c0y) + 3 * t * t * (p1y - c1y);

  const angle = Math.atan2(ty, tx) * (180 / Math.PI);

  return { x, y, angle };
}

/**
 * Build a lookup table of cumulative segment lengths for a path.
 */
function buildSegmentLengths(points: PathPoint2D[], closed: boolean): number[] {
  const segCount = closed ? points.length : points.length - 1;
  const lengths: number[] = [];

  for (let i = 0; i < segCount; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];

    const c0x = p0.x + (p0.out?.x ?? 0);
    const c0y = p0.y + (p0.out?.y ?? 0);
    const c1x = p1.x + (p1.in?.x ?? 0);
    const c1y = p1.y + (p1.in?.y ?? 0);

    lengths.push(bezierSegmentLength(p0.x, p0.y, c0x, c0y, c1x, c1y, p1.x, p1.y));
  }

  return lengths;
}

/**
 * Evaluate a point along a path at a given progress (0–1).
 * Uses arc-length parameterization for uniform speed.
 */
export function evaluatePathAtProgress(
  points: PathPoint2D[],
  progress: number,
  closed = false,
): PathPosition {
  if (points.length < 2) {
    return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, angle: 0 };
  }

  // Clamp progress
  const t = Math.max(0, Math.min(1, progress));

  const segLengths = buildSegmentLengths(points, closed);
  const totalLength = segLengths.reduce((a, b) => a + b, 0);

  if (totalLength === 0) {
    return { x: points[0].x, y: points[0].y, angle: 0 };
  }

  const targetLength = t * totalLength;

  // Find which segment the target length falls in
  let accumulated = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (accumulated + segLen >= targetLength || i === segLengths.length - 1) {
      // Progress within this segment
      const segProgress = segLen === 0 ? 0 : (targetLength - accumulated) / segLen;

      const p0 = points[i];
      const p1 = points[(i + 1) % points.length];

      const c0x = p0.x + (p0.out?.x ?? 0);
      const c0y = p0.y + (p0.out?.y ?? 0);
      const c1x = p1.x + (p1.in?.x ?? 0);
      const c1y = p1.y + (p1.in?.y ?? 0);

      return evalBezier(p0.x, p0.y, c0x, c0y, c1x, c1y, p1.x, p1.y, segProgress);
    }
    accumulated += segLen;
  }

  // Fallback (shouldn't reach here)
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}
