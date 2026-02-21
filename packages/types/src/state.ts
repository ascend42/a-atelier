import type { Delta } from "./delta.js";
import type { Audio } from "./audio.js";

/** A named choreography — what layers do during this state */
export interface State {
  description?: string;
  tags?: string[];
  /** Duration in frames */
  duration: number;
  /** Animation instructions */
  deltas: Delta[];
  /** Audio track synchronized with this state */
  audio?: Audio;
}
