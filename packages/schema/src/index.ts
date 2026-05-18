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
  ShapeVisualSchema, TextVisualSchema, ImageVisualSchema, VideoVisualSchema,
  GroupVisualSchema, RefVisualSchema,
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
export { validateDocument, validateLayer, validateDelta, validateVideoLayer, validateRecipe } from "./validate.js";
export type { ValidationResult, ValidationError } from "./validate.js";

// Studio Recipe schema (Phase 1 + Phase 1.5 overlay_rules)
export {
  StudioRecipeSchema,
  SilencePolicySchema,
  CaptionStyleSchema,
  CaptionGroupingSchema,
  OverlayRulesSchema,
  OverlayHandleRuleSchema,
  OverlayPageNumberRuleSchema,
  OverlayTextStyleSchema,
  OverlayAnchorSchema,
  RESERVED_RECIPE_FIELDS,
} from "./recipe.js";

// YAML parsing
export { parseAtelier, serializeAtelier } from "./parse.js";
