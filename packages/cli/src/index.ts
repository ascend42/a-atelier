// @a-company/atelier-cli — CLI tool: validate, preview, render, info commands

// Command registration functions (for programmatic use)
export { validateCommand, validateFile } from "./commands/validate.js";
export { infoCommand, getInfo } from "./commands/info.js";
export type { DocumentInfo } from "./commands/info.js";
export { stillCommand, resolveStill } from "./commands/still.js";
export { renderCommand } from "./commands/render.js";
export { exportSvgCommand } from "./commands/export-svg.js";
export { exportLottieCommand } from "./commands/export-lottie.js";
export { exportImageCommand, resolveExportDimensions } from "./commands/export-image.js";
export {
  carouselCommand,
  composeCarouselFrameDoc,
  expandInputs,
  carouselFileName,
} from "./commands/carousel.js";
export {
  renderDocumentToPng,
  fitImageToCanvas,
  loadCanvasModule,
  CanvasUnavailableError,
} from "./lib/render-image.js";
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
  rewriteCutLayers,
  effectiveSpan,
  VIDEO_PROJECT_VERSION,
  VIDEO_CUTLIST_VERSION,
} from "./lib/video-project.js";
export type { VideoProject } from "./lib/video-project.js";

// Silence trim — parametric cuts + atelier trim pipeline
export { trimCommand, trimProject } from "./commands/trim.js";
export type { TrimOptions, TrimResult } from "./commands/trim.js";

// Transcribe — Whisper + editable transcript + caption layers
export { transcribeCommand, transcribeProject } from "./commands/transcribe.js";
export type { TranscribeOptions, TranscribeResult } from "./commands/transcribe.js";
export { transcriptCommand } from "./commands/transcript.js";
export { captionsCommand } from "./commands/captions.js";
export {
  buildCaptionLayers,
  rewriteCaptionLayers,
} from "./lib/caption-builder.js";
export type { CaptionStyle, BuildCaptionsOptions } from "./lib/caption-builder.js";
export {
  flattenWords,
  groupIntoPhrases,
  mergeTranscriptWithExisting,
  applyTextEdit,
  applyBatchReplace,
  applyHide,
  applyAdd,
  applyMerge,
  applySplit,
} from "./lib/transcript-model.js";
export {
  probeWhisper,
  runWhisperCpp,
  parseWhisperCppJson,
} from "./lib/whisper.js";
export type { WhisperBackend, WhisperModel, WhisperOptions } from "./lib/whisper.js";
export { VIDEO_TRANSCRIPT_VERSION } from "./lib/video-project.js";

// Studio Recipe — Phase 1
export { recipeCommand } from "./commands/recipe.js";
export { applyRecipeCommand } from "./commands/apply-recipe.js";

// First-run setup — Phase 3 delegation C
export { initCommand, runInit, isInsideGitRepo, parseModeAnswer } from "./commands/init.js";
export type { RunInitOptions, InitResult } from "./commands/init.js";
export {
  writeLearningMode,
  readLearningMode,
  learningModePath,
  renderLearningModeYaml,
  LEARNING_MODES,
  LEARNING_MODE_VERSION,
} from "./lib/learning-mode.js";
export type { LearningMode, LearningModeFile } from "./lib/learning-mode.js";

// Front-of-pipeline artifacts — Phase 2 CLI surface
export { artifactsCommand } from "./commands/artifacts.js";
export {
  loadArtifactsFromProject,
  ARTIFACT_FILENAMES,
} from "./lib/artifact-project.js";
export type {
  LoadedArtifactProject,
  ArtifactParseError,
} from "./lib/artifact-project.js";
export {
  loadRecipe,
  resolveRecipePath,
  scaffoldRecipeYaml,
  applyRecipeToTrimOptions,
  applyRecipeToTranscribeOptions,
  applyRecipeToCaptionOptions,
  renderRecipeWithDefaults,
  recipeToYaml,
  RECIPE_VERSION,
} from "./lib/recipe.js";
export type { LoadedRecipe } from "./lib/recipe.js";
