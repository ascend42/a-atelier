import type { Delta } from "./delta.js";
import type { Audio } from "./audio.js";
import type { Easing } from "./easing.js";

/** Transition definition for smooth crossfade between states */
export interface StateTransitionConfig {
  /** Duration of the transition in frames */
  duration: number;
  /** Easing function for the transition blend */
  easing?: Easing;
}

/** A named choreography — what layers do during this state */
export interface State {
  description?: string;
  tags?: string[];
  /** Parent state name — inherits deltas from parent (child overrides win) */
  parent?: string;
  /** Duration in frames */
  duration: number;
  /** Animation instructions */
  deltas: Delta[];
  /** Audio track synchronized with this state */
  audio?: Audio;
  /** Transition configurations keyed by target state name */
  transitions?: Record<string, StateTransitionConfig>;
}
