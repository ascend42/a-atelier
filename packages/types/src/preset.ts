import type { AnimatableProperty } from "./delta.js";
import type { Easing } from "./easing.js";

/** A delta template within a preset — layer is not specified (applied at usage) */
export interface PresetDelta {
  property: AnimatableProperty;
  /** Relative frame offset from application point */
  offset?: [number, number];
  from: unknown;
  to: unknown;
  easing?: Easing;
}

/** A named, reusable delta set */
export interface Preset {
  description?: string;
  tags?: string[];
  deltas: PresetDelta[];
}
