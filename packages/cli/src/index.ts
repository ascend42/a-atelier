// @atelier/cli — CLI tool: validate, preview, render, info commands

// Command registration functions (for programmatic use)
export { validateCommand, validateFile } from "./commands/validate.js";
export { infoCommand, getInfo } from "./commands/info.js";
export type { DocumentInfo } from "./commands/info.js";
export { stillCommand, resolveStill } from "./commands/still.js";
export { renderCommand } from "./commands/render.js";
export {
  checkFfmpeg,
  buildFfmpegArgs,
  renderDocument,
} from "./commands/render-pipeline.js";
export type {
  RenderFormat,
  RenderOptions,
  RenderResult,
  ProgressInfo,
} from "./commands/render-pipeline.js";
