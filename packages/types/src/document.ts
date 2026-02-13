import type { Layer } from "./layer.js";
import type { State } from "./state.js";
import type { Preset } from "./preset.js";
import type { Variable } from "./variable.js";
import type { Asset } from "./asset.js";

/** Canvas configuration */
export interface Canvas {
  width: number;
  height: number;
  fps: number;
  /** Background color (optional) */
  background?: string;
}

/** The root animation document */
export interface AtelierDocument {
  /** Format version */
  version: string;
  /** Animation name */
  name: string;
  description?: string;
  tags?: string[];
  canvas: Canvas;
  variables?: Record<string, Variable>;
  assets?: Record<string, Asset>;
  presets?: Record<string, Preset>;
  layers: Layer[];
  states: Record<string, State>;
}
