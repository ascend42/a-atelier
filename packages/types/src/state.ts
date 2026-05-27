import type { Delta } from "./delta.js";
import type { Easing } from "./easing.js";

/** Transition definition for smooth crossfade between states */
export interface StateTransitionConfig {
  /** Duration of the transition in frames */
  duration: number;
  /** Easing function for the transition blend */
  easing?: Easing;
}

/**
 * A named choreography — what layers do during this state.
 *
 * Removed in v1.0: `audio?: Audio`. Audio is now a first-class `AudioVisual`
 * layer (see `layer.ts`) so it participates in tracks, parenting, and the
 * timeline summary like video clips. Pre-1.0 documents that still carry
 * `state.audio` are tolerated by the parser but the field is ignored —
 * authors should migrate to audio layers.
 */
export interface State {
  description?: string;
  tags?: string[];
  /** Parent state name — inherits deltas from parent (child overrides win) */
  parent?: string;
  /** Duration in frames */
  duration: number;
  /** Animation instructions */
  deltas: Delta[];
  /** Transition configurations keyed by target state name */
  transitions?: Record<string, StateTransitionConfig>;
}
