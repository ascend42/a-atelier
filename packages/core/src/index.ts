// Frame & delta resolution
export { resolveFrame } from "./resolver/frame-resolver.js";
export type { ResolvedFrame, ResolvedLayer } from "./resolver/frame-resolver.js";
export {
  resolveDeltaValue,
  resolvePropertyAtFrame,
  isFrameInRange,
  computeProgress,
  interpolateValue,
} from "./resolver/delta-resolver.js";
export { resolveEasing } from "./resolver/easing-resolver.js";

// Validation
export {
  validateNoOverlap,
  validateAllDeltas,
  rangesOverlap,
} from "./validation/overlap-validator.js";
export type { OverlapError } from "./validation/overlap-validator.js";

// Builder
export { DocumentBuilder, createDocument } from "./builder/document-builder.js";

// Units
export { resolveUnit, isPercentage, parsePercentage } from "./units/resolve-units.js";

// Presets
export { expandPreset } from "./presets/preset-resolver.js";
