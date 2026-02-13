export interface LinearEasing {
  type: "linear";
}

export interface CubicBezierEasing {
  type: "cubic-bezier";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SpringEasing {
  type: "spring";
  mass?: number;
  stiffness?: number;
  damping?: number;
  velocity?: number;
}

export interface StepEasing {
  type: "step";
  steps: number;
  position?: "start" | "end";
}

/** Named easing presets */
export type EasingPreset = "ease-in" | "ease-out" | "ease-in-out";

export type Easing = LinearEasing | CubicBezierEasing | SpringEasing | StepEasing | EasingPreset;
