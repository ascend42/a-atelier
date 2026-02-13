import type { Delta, FrameRange } from "@atelier/types";
import { lerp, clamp } from "@atelier/math";
import { resolveEasing } from "./easing-resolver.js";

/**
 * Check if a frame is within a delta's range (inclusive).
 */
export function isFrameInRange(frame: number, range: FrameRange): boolean {
  return frame >= range[0] && frame <= range[1];
}

/**
 * Compute the progress (0-1) of a frame within a delta's range.
 */
export function computeProgress(frame: number, range: FrameRange): number {
  const [start, end] = range;
  if (start === end) return 1; // instantaneous
  return clamp((frame - start) / (end - start), 0, 1);
}

/**
 * Resolve a single delta's value at a given frame.
 * Returns undefined if the frame is outside the delta's range.
 * Returns the interpolated value if within range.
 */
export function resolveDeltaValue(delta: Delta, frame: number): unknown | undefined {
  if (!isFrameInRange(frame, delta.range)) {
    return undefined;
  }

  const progress = computeProgress(frame, delta.range);
  const easingFn = resolveEasing(delta.easing);
  const easedProgress = easingFn(progress);

  return interpolateValue(delta.from, delta.to, easedProgress);
}

/**
 * Interpolate between two values based on eased progress.
 * Handles numbers, strings (pass-through at threshold), and nested objects.
 */
export function interpolateValue(from: unknown, to: unknown, t: number): unknown {
  // Number interpolation
  if (typeof from === "number" && typeof to === "number") {
    return lerp(from, to, t);
  }

  // String (e.g. hex colors, percentage units) — snap at end
  if (typeof from === "string" && typeof to === "string") {
    return t >= 1 ? to : from;
  }

  // For unknown types, snap at end
  return t >= 1 ? to : from;
}

/**
 * Given multiple deltas for the SAME layer+property, find the active one
 * at a given frame and return its resolved value.
 * Assumes no overlaps (validated elsewhere).
 */
export function resolvePropertyAtFrame(
  deltas: Delta[],
  frame: number,
): unknown | undefined {
  for (const delta of deltas) {
    if (isFrameInRange(frame, delta.range)) {
      return resolveDeltaValue(delta, frame);
    }
  }
  return undefined;
}
