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

// State machine
export { StateMachine } from "./state/state-machine.js";
export type { StateTransition, PlaybackState } from "./state/state-machine.js";

// Templates
export { instantiateTemplate, findTemplateVariables } from "./templates/template-resolver.js";
export type { TemplateBindings, TemplateError, TemplateResult } from "./templates/template-resolver.js";

// Expressions
export { evaluateExpression, isExpression } from "./expressions/expression-evaluator.js";
export type { ExpressionContext } from "./expressions/expression-evaluator.js";

// Audio timing
export { frameToTime, timeToFrame, computeAudioState, computeAudioCues } from "./audio/audio-timing.js";
export type { AudioPlaybackState } from "./audio/audio-timing.js";
