// Main export entry
export { exportToLottie } from "./export-lottie.js";
export type { ExportLottieOptions, ExportLottieResult } from "./export-lottie.js";

// Lottie types
export type {
  LottieAnimation,
  LottieLayer,
  LottieTransform,
  LottieAnimatedValue,
  LottieAnimatedMultiValue,
  LottieKeyframe,
  LottieMultiKeyframe,
  LottieShapeItem,
  LottieTextData,
  LottieAsset,
} from "./lottie-types.js";

// Mapping utilities
export { mapShapeVisual } from "./map-shapes.js";
export { mapDeltasToAnimated, mapPositionDeltas } from "./map-keyframes.js";
export { mapEasing, isLossyEasing } from "./map-easing.js";
export { colorToLottie } from "./map-colors.js";
export { collectUnsupportedWarnings } from "./warnings.js";
