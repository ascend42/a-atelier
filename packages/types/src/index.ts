// @a-company/atelier-types — Pure TypeScript type definitions for the Atelier animation format
// Zero runtime, type-only package

// units.ts
export type { Pixel, Percentage, UnitValue } from "./units.js";

// coordinates.ts
export type { Frame, Bounds, AnchorPoint } from "./coordinates.js";

// color.ts
export type { RGBAColor, HSLAColor, HexColor, Color } from "./color.js";

// shape.ts
export type {
  PathPoint,
  RectShape,
  EllipseShape,
  PathShape,
  Shape,
  GradientStop,
  SolidFill,
  LinearGradientFill,
  RadialGradientFill,
  Fill,
  Stroke,
  TextStyle,
} from "./shape.js";

// shadow.ts
export type { Shadow } from "./shadow.js";

// layer.ts
export type {
  SpritesheetConfig,
  ShapeVisual,
  TextVisual,
  ImageVisual,
  VideoVisual,
  AudioVisual,
  GroupVisual,
  RefVisual,
  Visual,
  Layer,
  BlendMode,
  MotionPath,
} from "./layer.js";

// easing.ts
export type {
  LinearEasing,
  CubicBezierEasing,
  SpringEasing,
  StepEasing,
  EasingPreset,
  Easing,
} from "./easing.js";

// delta.ts
export type { AnimatableProperty, FrameRange, Delta } from "./delta.js";

// state.ts
export type { State, StateTransitionConfig } from "./state.js";

// timeline.ts
export type { Timeline, TimelineTrack, TimelineClip } from "./timeline.js";

// slides.ts
export type { SlideRef, SlideTransition } from "./slides.js";

// design.ts
export type {
  AtelierDesign,
  AtelierDesignRelation,
  DesignRelation,
  DesignTypography,
  DesignMotion,
} from "./design.js";

// preset.ts
export type { PresetDelta, Preset } from "./preset.js";

// variable.ts
export type { VariableType, Variable } from "./variable.js";

// interaction.ts
export type { TriggerType, Trigger, ActionType, Action, Interaction } from "./interaction.js";

// asset.ts
export type { AssetType, Asset } from "./asset.js";

// document.ts
export type { Canvas, AtelierDocument, ProjectKind } from "./document.js";

// video-project.ts
export type {
  CutEntry,
  VideoCutList,
  TranscriptWord,
  TranscriptSegment,
  TranscriptDerivedFrom,
  VideoTranscript,
  VideoProjectManifest,
} from "./video-project.js";

// recipe.ts
export type {
  StudioRecipe,
  SilencePolicy,
  CaptionStyle,
  CaptionGrouping,
  OverlayRules,
  OverlayHandleRule,
  OverlayPageNumberRule,
  OverlayTextStyle,
  OverlayAnchor,
} from "./recipe.js";
