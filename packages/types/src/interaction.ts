/** Trigger types for layer interactions */
export type TriggerType = "click" | "hover" | "pointerdown" | "pointerup" | "timer" | "signal";

/** A trigger that initiates an interaction */
export interface Trigger {
  type: TriggerType;
  /** For timer: delay in milliseconds */
  delay?: number;
  /** For signal: the signal name to listen for */
  signal?: string;
}

/** Action types for interactions */
export type ActionType = "go-to-state" | "emit-signal" | "set-variable" | "toggle-visibility";

/** An action performed when a trigger fires */
export interface Action {
  type: ActionType;
  /** For go-to-state: target state name */
  state?: string;
  /** For emit-signal: signal name to emit */
  signal?: string;
  /** For set-variable: variable name */
  variable?: string;
  /** For set-variable: value to set */
  value?: unknown;
  /** For toggle-visibility: target layer ID (defaults to self) */
  targetLayer?: string;
}

/** A trigger-action binding on a layer */
export interface Interaction {
  /** Unique interaction ID */
  id: string;
  /** What triggers this interaction */
  trigger: Trigger;
  /** What happens when triggered */
  action: Action;
  description?: string;
}
