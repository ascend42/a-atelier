import type { Easing } from "@a-company/atelier-types";

export interface LottieEasing {
  i: { x: number[]; y: number[] };
  o: { x: number[]; y: number[] };
}

/** Map an Atelier easing to Lottie bezier easing curves */
export function mapEasing(easing: Easing | undefined): LottieEasing | { h: 1 } {
  if (!easing) return linearEasing();

  if (typeof easing === "string") {
    switch (easing) {
      case "ease-in":
        return bezierEasing(0.42, 0, 1, 1);
      case "ease-out":
        return bezierEasing(0, 0, 0.58, 1);
      case "ease-in-out":
        return bezierEasing(0.42, 0, 0.58, 1);
      default:
        return linearEasing();
    }
  }

  switch (easing.type) {
    case "linear":
      return linearEasing();
    case "cubic-bezier":
      return bezierEasing(easing.x1, easing.y1, easing.x2, easing.y2);
    case "spring":
      // Approximate spring as a cubic-bezier (lossy)
      return bezierEasing(0.25, 0.1, 0.25, 1);
    case "step":
      // Steps map to hold keyframes
      return { h: 1 };
    default:
      return linearEasing();
  }
}

function linearEasing(): LottieEasing {
  return {
    i: { x: [0.833], y: [0.833] },
    o: { x: [0.167], y: [0.167] },
  };
}

function bezierEasing(x1: number, y1: number, x2: number, y2: number): LottieEasing {
  return {
    i: { x: [x2], y: [y2] },
    o: { x: [x1], y: [y1] },
  };
}

/** Check if an easing is lossy (spring/step → approximated) */
export function isLossyEasing(easing: Easing | undefined): string | null {
  if (!easing || typeof easing === "string") return null;
  if (easing.type === "spring") return "Spring easing approximated as cubic-bezier";
  if (easing.type === "step") return "Step easing mapped to hold keyframes";
  return null;
}
