// @a-company/atelier-cli — CLI tool: validate, preview, render, info commands

// Command registration functions (for programmatic use)
export { validateCommand, validateFile } from "./commands/validate.js";
export { infoCommand, getInfo } from "./commands/info.js";
export type { DocumentInfo } from "./commands/info.js";
export { stillCommand, resolveStill } from "./commands/still.js";
export { renderCommand } from "./commands/render.js";
export { exportSvgCommand } from "./commands/export-svg.js";
export { exportLottieCommand } from "./commands/export-lottie.js";
export { assetsCommand, getAssets } from "./commands/assets.js";
export type { AssetInfo } from "./commands/assets.js";
export { variablesCommand, getVariables } from "./commands/variables.js";
export type { VariableInfo } from "./commands/variables.js";
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

// VideoProject — local-first video project folder structure
export {
  createVideoProject,
  loadVideoProject,
  readCutList,
  writeCutList,
  readTranscript,
  writeTranscript,
  readComposition,
  writeComposition,
  VIDEO_PROJECT_VERSION,
} from "./lib/video-project.js";
export type { VideoProject } from "./lib/video-project.js";
