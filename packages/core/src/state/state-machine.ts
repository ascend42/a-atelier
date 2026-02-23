import type { AtelierDocument, Easing, State, Delta } from "@a-company/atelier-types";
import { resolveFrame, type ResolvedFrame } from "../resolver/frame-resolver.js";
import { resolveEasing } from "../resolver/easing-resolver.js";

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

export interface ActiveTransition {
  fromState: string;
  toState: string;
  duration: number;
  easingFn: (t: number) => number;
  transitionFrame: number; // how many frames into the transition
}

export class StateMachine {
  private currentState: string;
  private currentFrame = 0;
  private transitions: StateTransition[] = [];
  private activeTransition: ActiveTransition | null = null;

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

  /** Check if currently in a transition blend */
  isTransitioning(): boolean {
    return this.activeTransition !== null;
  }

  /** Get transition progress (0–1) with easing applied, or null if not transitioning */
  getTransitionProgress(): number | null {
    if (!this.activeTransition) return null;
    const { transitionFrame, duration, easingFn } = this.activeTransition;
    const rawProgress = Math.min(transitionFrame / duration, 1);
    return easingFn(rawProgress);
  }

  // ── Hierarchical State Support ────────────────────────────

  /**
   * Resolve the ancestor chain for a state (root → … → parent → self).
   * Throws on circular parent references.
   */
  resolveAncestorChain(stateName: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();
    let current: string | undefined = stateName;

    while (current) {
      if (visited.has(current)) {
        throw new Error(`Circular parent reference detected: "${current}" already in chain [${chain.join(" → ")}]`);
      }
      visited.add(current);
      chain.unshift(current); // prepend so root is first
      const stateObj: State | undefined = this.doc.states[current];
      if (!stateObj) {
        throw new Error(`Parent state "${current}" not found`);
      }
      current = stateObj.parent;
    }

    return chain;
  }

  /**
   * Collect merged deltas from ancestor chain.
   * Child overrides parent deltas for the same layer+property combination.
   * Deltas for different layer+property pairs are accumulated from all ancestors.
   */
  collectDeltas(stateName: string): Delta[] {
    const chain = this.resolveAncestorChain(stateName);
    // Walk root → child. Later entries override earlier for same layer+property.
    const deltaMap = new Map<string, Delta[]>();

    for (const ancestorName of chain) {
      const state = this.doc.states[ancestorName];
      // Group this state's deltas by layer+property
      const stateGroups = new Map<string, Delta[]>();
      for (const delta of state.deltas) {
        const key = `${delta.layer}:${delta.property}`;
        if (!stateGroups.has(key)) stateGroups.set(key, []);
        stateGroups.get(key)!.push(delta);
      }
      // Child replaces parent for same key
      for (const [key, deltas] of stateGroups) {
        deltaMap.set(key, deltas);
      }
    }

    // Flatten all deltas
    const result: Delta[] = [];
    for (const deltas of deltaMap.values()) {
      result.push(...deltas);
    }
    return result;
  }

  // ── Playback ──────────────────────────────────────────────

  /** Advance to next frame, returns resolved frame */
  tick(): PlaybackState {
    // Handle active transition
    if (this.activeTransition) {
      this.activeTransition.transitionFrame++;
      if (this.activeTransition.transitionFrame >= this.activeTransition.duration) {
        // Transition complete
        this.activeTransition = null;
      }
    }

    const resolved = this.resolveCurrentFrame();
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

  /** Resolve the current frame, blending if in transition */
  private resolveCurrentFrame(): ResolvedFrame {
    if (this.activeTransition) {
      const progress = this.getTransitionProgress()!;
      const fromResolved = resolveFrame(
        this.doc, this.activeTransition.fromState, this.currentFrame,
        this.collectDeltas(this.activeTransition.fromState),
      );
      const toResolved = resolveFrame(
        this.doc, this.activeTransition.toState, this.currentFrame,
        this.collectDeltas(this.activeTransition.toState),
      );
      return blendResolvedFrames(fromResolved, toResolved, progress);
    }

    // Check if current state has a parent — use merged deltas
    const state = this.doc.states[this.currentState];
    if (state.parent) {
      const mergedDeltas = this.collectDeltas(this.currentState);
      return resolveFrame(this.doc, this.currentState, this.currentFrame, mergedDeltas);
    }

    return resolveFrame(this.doc, this.currentState, this.currentFrame);
  }

  /** Transition to a different state (instant or blended) */
  transition(stateName: string, startFrame = 0): void {
    if (!this.doc.states[stateName]) {
      throw new Error(`State "${stateName}" not found`);
    }

    const fromState = this.currentState;
    const currentStateObj = this.doc.states[fromState];
    const transConfig = currentStateObj.transitions?.[stateName];

    this.transitions.push({
      from: fromState,
      to: stateName,
      at: this.currentFrame,
    });

    if (transConfig && transConfig.duration > 0) {
      // Start a smooth transition
      this.activeTransition = {
        fromState,
        toState: stateName,
        duration: transConfig.duration,
        easingFn: resolveEasing(transConfig.easing),
        transitionFrame: 0,
      };
    }

    this.currentState = stateName;
    this.currentFrame = startFrame;
  }

  /**
   * Start a smooth transition to target state with explicit duration/easing.
   * This ignores any transitions config on the state.
   */
  transitionTo(targetState: string, duration: number, easing?: Easing): void {
    if (!this.doc.states[targetState]) {
      throw new Error(`State "${targetState}" not found`);
    }

    const fromState = this.currentState;
    this.transitions.push({
      from: fromState,
      to: targetState,
      at: this.currentFrame,
    });

    this.activeTransition = {
      fromState,
      toState: targetState,
      duration,
      easingFn: resolveEasing(easing),
      transitionFrame: 0,
    };

    this.currentState = targetState;
    this.currentFrame = 0;
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
    this.activeTransition = null;
  }

  /** Get transition history */
  get history(): ReadonlyArray<StateTransition> {
    return this.transitions;
  }

  /** Resolve a specific frame without advancing */
  resolveAt(stateName: string, frame: number): ResolvedFrame {
    if (!this.doc.states[stateName]) throw new Error(`State "${stateName}" not found`);
    const state = this.doc.states[stateName];
    if (state.parent) {
      return resolveFrame(this.doc, stateName, frame, this.collectDeltas(stateName));
    }
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

// ── Frame Blending ────────────────────────────────────────────

import type { ResolvedLayer } from "../resolver/frame-resolver.js";
import type { AnimatableProperty } from "@a-company/atelier-types";
import { interpolateValue } from "../resolver/delta-resolver.js";

/**
 * Blend two resolved frames together for smooth state transitions.
 * Numeric properties are lerped, colors are color-lerped, discrete values snap at t >= 0.5.
 */
export function blendResolvedFrames(
  frameA: ResolvedFrame,
  frameB: ResolvedFrame,
  t: number,
): ResolvedFrame {
  // Build layer maps
  const mapA = new Map<string, ResolvedLayer>();
  const mapB = new Map<string, ResolvedLayer>();
  for (const l of frameA.layers) mapA.set(l.id, l);
  for (const l of frameB.layers) mapB.set(l.id, l);

  // Get all unique layer IDs
  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
  const blendedLayers: ResolvedLayer[] = [];

  for (const id of allIds) {
    const layerA = mapA.get(id);
    const layerB = mapB.get(id);

    if (layerA && layerB) {
      // Both exist — blend computed properties
      blendedLayers.push(blendLayers(layerA, layerB, t));
    } else if (layerA && !layerB) {
      // Only in A — fade out (set opacity toward 0)
      blendedLayers.push(fadeLayer(layerA, 1 - t));
    } else if (!layerA && layerB) {
      // Only in B — fade in (set opacity from 0)
      blendedLayers.push(fadeLayer(layerB, t));
    }
  }

  return {
    frame: frameB.frame,
    stateName: frameB.stateName,
    layers: blendedLayers,
  };
}

function blendLayers(a: ResolvedLayer, b: ResolvedLayer, t: number): ResolvedLayer {
  const allProps = new Set([
    ...Object.keys(a.computedProperties),
    ...Object.keys(b.computedProperties),
  ]);

  const blended: Partial<Record<AnimatableProperty, unknown>> = {};

  for (const prop of allProps) {
    const valA = a.computedProperties[prop as AnimatableProperty];
    const valB = b.computedProperties[prop as AnimatableProperty];

    if (valA !== undefined && valB !== undefined) {
      blended[prop as AnimatableProperty] = interpolateValue(valA, valB, t);
    } else if (valA !== undefined) {
      blended[prop as AnimatableProperty] = valA;
    } else {
      blended[prop as AnimatableProperty] = valB;
    }
  }

  return {
    id: a.id,
    layer: a.layer,
    computedProperties: blended,
  };
}

function fadeLayer(layer: ResolvedLayer, opacity: number): ResolvedLayer {
  const cp = { ...layer.computedProperties };
  const existingOpacity = (cp.opacity as number) ?? 1;
  cp.opacity = existingOpacity * opacity;
  return {
    id: layer.id,
    layer: layer.layer,
    computedProperties: cp,
  };
}
