// @a-company/atelier-schema — Zod validation schemas with AI-readable error messages

// Schemas
export { PixelSchema, PercentageSchema, UnitValueSchema } from "./units.js";
export { FrameSchema, BoundsSchema, AnchorPointSchema } from "./coordinates.js";
export { RGBAColorSchema, HSLAColorSchema, HexColorSchema, ColorSchema } from "./color.js";
export {
  PathPointSchema, RectShapeSchema, EllipseShapeSchema, PathShapeSchema, ShapeSchema,
  GradientStopSchema, SolidFillSchema, LinearGradientFillSchema, RadialGradientFillSchema, FillSchema,
  StrokeSchema, TextStyleSchema,
} from "./shape.js";
export {
  LinearEasingSchema, CubicBezierEasingSchema, SpringEasingSchema, StepEasingSchema,
  EasingPresetSchema, EasingSchema,
} from "./easing.js";
export { ShadowSchema } from "./shadow.js";
export {
  ShapeVisualSchema, TextVisualSchema, ImageVisualSchema, GroupVisualSchema, RefVisualSchema,
  VisualSchema, LayerSchema, BlendModeSchema, MotionPathSchema,
  SpritesheetConfigSchema, SourceRectSchema,
} from "./layer.js";
export { AnimatablePropertySchema, FrameRangeSchema, DeltaSchema } from "./delta.js";
export { AudioSchema, StateSchema } from "./state.js";
export { PresetDeltaSchema, PresetSchema } from "./preset.js";
export { VariableTypeSchema, VariableSchema } from "./variable.js";
export { AssetTypeSchema, AssetSchema } from "./asset.js";
export { TriggerTypeSchema, TriggerSchema, ActionTypeSchema, ActionSchema, InteractionSchema } from "./interaction.js";
export { CanvasSchema, AtelierDocumentSchema } from "./document.js";

// Validation functions
export { validateDocument, validateLayer, validateDelta } from "./validate.js";
export type { ValidationResult, ValidationError } from "./validate.js";

// YAML parsing
export { parseAtelier, serializeAtelier } from "./parse.js";
