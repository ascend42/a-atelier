import type { UnitValue } from "./units.js";

/** Position within parent coordinate space */
export interface Frame {
  x: UnitValue;
  y: UnitValue;
}

/** Size of a layer */
export interface Bounds {
  width: UnitValue;
  height: UnitValue;
}

/** Anchor point for transforms (0-1 normalized) */
export interface AnchorPoint {
  x: number;
  y: number;
}
