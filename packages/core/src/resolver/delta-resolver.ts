import type { Delta, FrameRange } from "@atelier/types";
import { lerp, clamp, hexToRgba, lerpRgba, rgbaToHex } from "@atelier/math";
import { resolveEasing } from "./easing-resolver.js";
import { isExpression, evaluateExpression, type ExpressionContext } from "../expressions/expression-evaluator.js";

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
 *
 * If `from` or `to` is an expression object `{ expr: "..." }`,
 * it is evaluated with the current animation context before interpolation.
 */
export function resolveDeltaValue(delta: Delta, frame: number): unknown | undefined {
  if (!isFrameInRange(frame, delta.range)) {
    return undefined;
  }

  const progress = computeProgress(frame, delta.range);
  const easingFn = resolveEasing(delta.easing);
  const easedProgress = easingFn(progress);

  const exprCtx: ExpressionContext = {
    t: easedProgress,
    progress,
    frame,
    duration: delta.range[1] - delta.range[0],
  };

  const from = isExpression(delta.from)
    ? evaluateExpression(delta.from.expr, exprCtx)
    : delta.from;

  const to = isExpression(delta.to)
    ? evaluateExpression(delta.to.expr, exprCtx)
    : delta.to;

  return interpolateValue(from, to, easedProgress);
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

  // Hex color interpolation
  if (typeof from === "string" && typeof to === "string") {
    if (from.startsWith("#") && to.startsWith("#")) {
      return rgbaToHex(lerpRgba(hexToRgba(from), hexToRgba(to), t));
    }
    // Non-color strings — snap at end
    return t >= 1 ? to : from;
  }

  // Boolean interpolation — snap at midpoint for frame-precise control
  if (typeof from === "boolean" && typeof to === "boolean") {
    return t >= 0.5 ? to : from;
  }

  // For unknown types, snap at end
  return t >= 1 ? to : from;
}

/**
 * Given multiple deltas for the SAME layer+property, find the active one
 * at a given frame and return its resolved value.
 *
 * If no delta is active at this frame, holds the `to` value of the most
 * recent completed delta (the one whose range ended most recently before
 * this frame). This prevents properties from reverting after animation ends.
 *
 * Assumes no overlaps (validated elsewhere).
 */
export function resolvePropertyAtFrame(
  deltas: Delta[],
  frame: number,
): unknown | undefined {
  // Check for an active delta first
  for (const delta of deltas) {
    if (isFrameInRange(frame, delta.range)) {
      return resolveDeltaValue(delta, frame);
    }
  }

  // No active delta — hold the `to` value of the most recently completed delta
  let lastCompleted: Delta | undefined;
  for (const delta of deltas) {
    if (frame > delta.range[1]) {
      if (!lastCompleted || delta.range[1] > lastCompleted.range[1]) {
        lastCompleted = delta;
      }
    }
  }

  if (!lastCompleted) return undefined;

  // If the held `to` value is an expression, evaluate at t=1
  if (isExpression(lastCompleted.to)) {
    return evaluateExpression(lastCompleted.to.expr, {
      t: 1,
      progress: 1,
      frame,
      duration: lastCompleted.range[1] - lastCompleted.range[0],
    });
  }

  return lastCompleted.to;
}
