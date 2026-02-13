import type { Easing } from "@atelier/types";
import { linear, cubicBezier, easeIn, easeOut, easeInOut, step, spring } from "@atelier/math";

/**
 * Converts an Easing type definition into an executable easing function.
 * Returns a function (t: number) => number where t is 0-1.
 */
export function resolveEasing(easing: Easing | undefined): (t: number) => number {
  if (!easing) return linear;

  // String presets
  if (typeof easing === "string") {
    switch (easing) {
      case "ease-in": return easeIn;
      case "ease-out": return easeOut;
      case "ease-in-out": return easeInOut;
      default: return linear;
    }
  }

  // Object easing definitions
  switch (easing.type) {
    case "linear":
      return linear;
    case "cubic-bezier":
      return cubicBezier(easing.x1, easing.y1, easing.x2, easing.y2);
    case "spring":
      return spring({
        mass: easing.mass,
        stiffness: easing.stiffness,
        damping: easing.damping,
        velocity: easing.velocity,
      });
    case "step":
      return step(easing.steps, easing.position);
    default:
      return linear;
  }
}
