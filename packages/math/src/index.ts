export { linear, cubicBezier, easeIn, easeOut, easeInOut, step } from "./easing.js";
export { spring } from "./spring.js";
export type { SpringConfig } from "./spring.js";
export { lerp, clamp, lerpArray, remap } from "./lerp.js";
export {
  hexToRgba,
  rgbaToHex,
  lerpRgba,
  rgbaToHsla,
  hslaToRgba,
  lerpHsla,
} from "./color.js";
export type { RGBA, HSLA } from "./color.js";
export { evaluatePathAtProgress } from "./path.js";
export type { PathPoint2D, PathPosition } from "./path.js";
