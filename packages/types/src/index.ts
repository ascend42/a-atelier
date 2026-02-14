// @atelier/types — Pure TypeScript type definitions for the Atelier animation format
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
  ShapeVisual,
  TextVisual,
  ImageVisual,
  GroupVisual,
  RefVisual,
  Visual,
  Layer,
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
export type { State } from "./state.js";

// preset.ts
export type { PresetDelta, Preset } from "./preset.js";

// variable.ts
export type { VariableType, Variable } from "./variable.js";

// asset.ts
export type { AssetType, Asset } from "./asset.js";

// document.ts
export type { Canvas, AtelierDocument } from "./document.js";
