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
  ShapeVisualSchema, TextVisualSchema, ImageVisualSchema, VideoVisualSchema, AudioVisualSchema,
  GroupVisualSchema, RefVisualSchema,
  VisualSchema, LayerSchema, BlendModeSchema, MotionPathSchema,
  SpritesheetConfigSchema, SourceRectSchema,
} from "./layer.js";
export { AnimatablePropertySchema, FrameRangeSchema, DeltaSchema } from "./delta.js";
export { StateSchema, StateTransitionConfigSchema } from "./state.js";
export { PresetDeltaSchema, PresetSchema } from "./preset.js";
export { VariableTypeSchema, VariableSchema } from "./variable.js";
export { AssetTypeSchema, AssetSchema } from "./asset.js";
export { TriggerTypeSchema, TriggerSchema, ActionTypeSchema, ActionSchema, InteractionSchema } from "./interaction.js";
export { CanvasSchema, AtelierDocumentSchema, ProjectKindSchema } from "./document.js";
export { TimelineSchema, TimelineTrackSchema, TimelineClipSchema } from "./timeline.js";
export { SlideRefSchema, SlideTransitionSchema } from "./slides.js";
export {
  AtelierDesignSchema,
  AtelierDesignRelationSchema,
  DesignRelationSchema,
  DesignTypographySchema,
  DesignMotionSchema,
} from "./design.js";

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

// Front-of-pipeline artifact schemas (Phase 2) — DESIGN, SCRIPT, STORYBOARD
export * from "./artifacts/index.js";

// Workspace manifest (post-core-build ergonomics — `workspace.atelier`)
export { WorkspaceManifestSchema, type WorkspaceManifest } from "./workspace.js";

// Media notes (sidecar `<file>.notes.md` for files in the project's `media/` dir)
export {
  MediaNotesSchema,
  MediaNotesFrontmatterSchema,
  MediaNotesConstraintsSchema,
  MediaNotesAuthorSchema,
  MEDIA_NOTES_HEADINGS,
  type MediaNotes,
  type MediaNotesFrontmatter,
  type MediaNotesConstraints,
  type MediaNotesAuthor,
} from "./media-notes.js";
