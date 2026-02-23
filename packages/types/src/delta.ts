import type { Easing } from "./easing.js";

/** Animatable layer properties — runtime Zod source of truth is in @atelier/schema */
export type AnimatableProperty =
  | "frame.x"
  | "frame.y"
  | "bounds.width"
  | "bounds.height"
  | "opacity"
  | "rotation"
  | "scale.x"
  | "scale.y"
  | "anchorPoint.x"
  | "anchorPoint.y"
  | "visual.shape.cornerRadius"
  | "visual.fill.color"
  | "visual.stroke.color"
  | "visual.stroke.width"
  | "visual.stroke.start"
  | "visual.stroke.end"
  | "visual.style.fontSize"
  | "visual.style.color"
  | "shadow.color"
  | "shadow.blur"
  | "shadow.offsetX"
  | "shadow.offsetY"
  | "motionPath.progress"
  | "visual.fill.angle"
  | "visual.fill.center.x"
  | "visual.fill.center.y"
  | "visual.fill.radius"
  | "visual.image.sourceRect.x"
  | "visual.image.sourceRect.y"
  | "visual.image.sourceRect.width"
  | "visual.image.sourceRect.height"
  | "visual.image.frameIndex"
  | "visible"
  | "tint.color"
  | "tint.amount";

/** Frame range [start, end] — inclusive, 0-based */
export type FrameRange = [number, number];

/** A single property animation over a keyframe range */
export interface Delta {
  id?: string;
  /** Optional display name */
  name?: string;
  /** Target layer ID */
  layer: string;
  /** Property being animated */
  property: AnimatableProperty;
  /** Frame range [start, end] */
  range: FrameRange;
  /** Starting value */
  from: unknown;
  /** Ending value */
  to: unknown;
  /** Easing function */
  easing?: Easing;
  description?: string;
  tags?: string[];
}
