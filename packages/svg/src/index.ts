// Main render entry
export { renderFrameSVG } from "./render-svg.js";
export type { RenderSVGOptions } from "./render-svg.js";

// Utilities (useful for custom SVG generation)
export { buildTransform, buildStyleAttrs, escapeXml } from "./svg-properties.js";
export { renderShapeSVG } from "./svg-shapes.js";
export { renderTextSVG } from "./svg-text.js";
export { buildGradientDef, colorToCSS } from "./svg-gradients.js";
export { buildShadowFilter } from "./svg-filters.js";
export { buildClipPathDef } from "./svg-clip.js";
