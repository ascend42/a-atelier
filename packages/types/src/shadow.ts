import type { Color } from "./color.js";

/** Drop shadow / glow effect applied to a layer */
export interface Shadow {
  color: Color;
  blur: number;
  offsetX?: number;
  offsetY?: number;
}
