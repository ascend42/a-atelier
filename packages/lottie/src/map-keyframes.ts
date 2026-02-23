import type { Delta, AnimatableProperty } from "@a-company/atelier-types";
import type { LottieAnimatedValue, LottieAnimatedMultiValue, LottieKeyframe, LottieMultiKeyframe } from "./lottie-types.js";
import { mapEasing, isLossyEasing } from "./map-easing.js";

/** Map deltas for a single layer+property to Lottie animated value */
export function mapDeltasToAnimated(
  deltas: Delta[],
  property: AnimatableProperty,
  warnings: string[],
): LottieAnimatedValue {
  if (deltas.length === 0) {
    return { a: 0, k: 0 };
  }

  // Check for lossy easings
  for (const d of deltas) {
    const lossyMsg = isLossyEasing(d.easing);
    if (lossyMsg) warnings.push(`${property}: ${lossyMsg}`);
  }

  // If expressions, warn and use static
  for (const d of deltas) {
    if (isExpression(d.from) || isExpression(d.to)) {
      warnings.push(`${property}: Expression values not supported in Lottie, using static values`);
      return { a: 0, k: typeof d.from === "number" ? d.from : 0 };
    }
  }

  // Single delta — simple animated value
  if (deltas.length === 1) {
    const d = deltas[0];
    const fromVal = resolveValue(d.from, property);
    const toVal = resolveValue(d.to, property);

    if (fromVal === toVal) {
      return { a: 0, k: fromVal };
    }

    const easing = mapEasing(d.easing);
    const kfs: LottieKeyframe[] = [];

    if ("h" in easing) {
      kfs.push({ t: d.range[0], s: [fromVal], h: 1 });
      kfs.push({ t: d.range[1], s: [toVal] });
    } else {
      kfs.push({ t: d.range[0], s: [fromVal], e: [toVal], i: easing.i, o: easing.o });
      kfs.push({ t: d.range[1], s: [toVal] });
    }

    return { a: 1, k: kfs };
  }

  // Multiple deltas — chain keyframes
  const sorted = [...deltas].sort((a, b) => a.range[0] - b.range[0]);
  const kfs: LottieKeyframe[] = [];

  for (const d of sorted) {
    const fromVal = resolveValue(d.from, property);
    const toVal = resolveValue(d.to, property);
    const easing = mapEasing(d.easing);

    if ("h" in easing) {
      kfs.push({ t: d.range[0], s: [fromVal], h: 1 });
    } else {
      kfs.push({ t: d.range[0], s: [fromVal], e: [toVal], i: easing.i, o: easing.o });
    }
  }

  // Final keyframe
  const last = sorted[sorted.length - 1];
  kfs.push({ t: last.range[1], s: [resolveValue(last.to, property)] });

  return { a: 1, k: kfs };
}

/** Map position deltas (frame.x, frame.y) to Lottie multi-dimensional animated value */
export function mapPositionDeltas(
  xDeltas: Delta[],
  yDeltas: Delta[],
  baseX: number,
  baseY: number,
  warnings: string[],
): LottieAnimatedMultiValue {
  const hasXAnim = xDeltas.length > 0;
  const hasYAnim = yDeltas.length > 0;

  if (!hasXAnim && !hasYAnim) {
    return { a: 0, k: [baseX, baseY, 0] };
  }

  // Collect all unique frame points
  const frames = new Set<number>();
  for (const d of [...xDeltas, ...yDeltas]) {
    frames.add(d.range[0]);
    frames.add(d.range[1]);
  }
  const sortedFrames = [...frames].sort((a, b) => a - b);

  if (sortedFrames.length < 2) {
    return { a: 0, k: [baseX, baseY, 0] };
  }

  // Build multi-dimensional keyframes
  const kfs: LottieMultiKeyframe[] = [];
  for (let i = 0; i < sortedFrames.length; i++) {
    const f = sortedFrames[i];
    const x = resolveAtFrame(xDeltas, f, baseX);
    const y = resolveAtFrame(yDeltas, f, baseY);

    if (i < sortedFrames.length - 1) {
      const nextF = sortedFrames[i + 1];
      const nextX = resolveAtFrame(xDeltas, nextF, baseX);
      const nextY = resolveAtFrame(yDeltas, nextF, baseY);

      // Find the active delta's easing
      const activeX = xDeltas.find(d => d.range[0] <= f && d.range[1] >= f);
      const activeY = yDeltas.find(d => d.range[0] <= f && d.range[1] >= f);
      const easing = mapEasing(activeX?.easing ?? activeY?.easing);

      if ("h" in easing) {
        kfs.push({ t: f, s: [x, y, 0], h: 1 });
      } else {
        kfs.push({ t: f, s: [x, y, 0], e: [nextX, nextY, 0], i: easing.i, o: easing.o });
      }
    } else {
      kfs.push({ t: f, s: [x, y, 0] });
    }
  }

  // Check for lossy warnings
  for (const d of [...xDeltas, ...yDeltas]) {
    const msg = isLossyEasing(d.easing);
    if (msg) warnings.push(`position: ${msg}`);
  }

  return { a: 1, k: kfs };
}

function resolveAtFrame(deltas: Delta[], frame: number, base: number): number {
  for (const d of deltas) {
    if (frame >= d.range[0] && frame <= d.range[1]) {
      const from = typeof d.from === "number" ? d.from : base;
      const to = typeof d.to === "number" ? d.to : base;
      const progress = d.range[0] === d.range[1] ? 1 : (frame - d.range[0]) / (d.range[1] - d.range[0]);
      return from + (to - from) * progress;
    }
  }
  // Hold last completed value
  let lastCompleted: Delta | undefined;
  for (const d of deltas) {
    if (frame > d.range[1]) {
      if (!lastCompleted || d.range[1] > lastCompleted.range[1]) {
        lastCompleted = d;
      }
    }
  }
  if (lastCompleted) return typeof lastCompleted.to === "number" ? lastCompleted.to : base;
  return base;
}

function resolveValue(val: unknown, _property: AnimatableProperty): number {
  if (typeof val === "number") return val;
  if (typeof val === "string" && val.startsWith("#")) {
    // Color — for Lottie, colors are handled separately
    return 0;
  }
  return 0;
}

function isExpression(val: unknown): boolean {
  return typeof val === "object" && val !== null && "expr" in val;
}
