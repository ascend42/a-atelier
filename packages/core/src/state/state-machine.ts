import type { AtelierDocument } from "@atelier/types";
import { resolveFrame, type ResolvedFrame } from "../resolver/frame-resolver.js";

export interface StateTransition {
  from: string;
  to: string;
  at: number; // frame at which transition occurs
}

export interface PlaybackState {
  stateName: string;
  frame: number;
  resolved: ResolvedFrame;
  isComplete: boolean;
}

export class StateMachine {
  private currentState: string;
  private currentFrame = 0;
  private transitions: StateTransition[] = [];

  constructor(
    private doc: AtelierDocument,
    initialState?: string,
  ) {
    // Default to first state
    const stateNames = Object.keys(doc.states);
    if (stateNames.length === 0) throw new Error("Document has no states");
    this.currentState = initialState ?? stateNames[0];
    if (!doc.states[this.currentState]) {
      throw new Error(`State "${this.currentState}" not found`);
    }
  }

  /** Get current state name */
  get state(): string {
    return this.currentState;
  }

  /** Get current frame */
  get frame(): number {
    return this.currentFrame;
  }

  /** Get all state names */
  get stateNames(): string[] {
    return Object.keys(this.doc.states);
  }

  /** Get current state duration */
  get duration(): number {
    return this.doc.states[this.currentState].duration;
  }

  /** Check if current state playback is complete */
  get isComplete(): boolean {
    return this.currentFrame >= this.duration - 1;
  }

  /** Advance to next frame, returns resolved frame */
  tick(): PlaybackState {
    const resolved = resolveFrame(this.doc, this.currentState, this.currentFrame);
    const result: PlaybackState = {
      stateName: this.currentState,
      frame: this.currentFrame,
      resolved,
      isComplete: this.isComplete,
    };
    if (this.currentFrame < this.duration - 1) {
      this.currentFrame++;
    }
    return result;
  }

  /** Transition to a different state */
  transition(stateName: string, startFrame = 0): void {
    if (!this.doc.states[stateName]) {
      throw new Error(`State "${stateName}" not found`);
    }
    this.transitions.push({
      from: this.currentState,
      to: stateName,
      at: this.currentFrame,
    });
    this.currentState = stateName;
    this.currentFrame = startFrame;
  }

  /** Seek to a specific frame in current state */
  seek(frame: number): void {
    this.currentFrame = Math.max(0, Math.min(frame, this.duration - 1));
  }

  /** Reset to initial state */
  reset(stateName?: string): void {
    if (stateName) {
      if (!this.doc.states[stateName]) throw new Error(`State "${stateName}" not found`);
      this.currentState = stateName;
    }
    this.currentFrame = 0;
  }

  /** Get transition history */
  get history(): ReadonlyArray<StateTransition> {
    return this.transitions;
  }

  /** Resolve a specific frame without advancing */
  resolveAt(stateName: string, frame: number): ResolvedFrame {
    if (!this.doc.states[stateName]) throw new Error(`State "${stateName}" not found`);
    return resolveFrame(this.doc, stateName, frame);
  }

  /** Play through entire current state, calling callback on each frame */
  playThrough(onFrame: (state: PlaybackState) => void): void {
    this.currentFrame = 0;
    while (!this.isComplete) {
      onFrame(this.tick());
    }
    onFrame(this.tick()); // last frame
  }
}
