// Main render entry
export { renderFrame } from "./render-frame.js";

// Types
export type { RenderContext, GradientLike } from "./canvas-types.js";
export type { EffectiveLayer } from "./apply-properties.js";

// Utilities (useful for custom renderers)
export { buildEffectiveLayer } from "./apply-properties.js";
export { colorToCSS, applyFill, applyStroke } from "./styles.js";
export { renderShape } from "./renderers/shape-renderer.js";
export { renderText } from "./renderers/text-renderer.js";
