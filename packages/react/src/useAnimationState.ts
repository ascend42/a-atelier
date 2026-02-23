import { useState, useCallback, useMemo } from "react";
import type { AtelierDocument } from "@a-company/atelier-types";

export interface UseAnimationStateReturn {
  currentState: string;
  transitionTo: (state: string) => void;
  states: string[];
}

/**
 * Hook for managing animation state transitions.
 * Works alongside useAnimation for state-based playback.
 */
export function useAnimationState(
  doc: AtelierDocument | null,
  playerControls?: { seek: (frame: number) => void },
): UseAnimationStateReturn {
  const states = useMemo(() => {
    if (!doc) return [];
    return Object.keys(doc.states);
  }, [doc]);

  const [currentState, setCurrentState] = useState(() => states[0] ?? "");

  const transitionTo = useCallback((state: string) => {
    if (!doc?.states[state]) {
      throw new Error(`State "${state}" not found`);
    }
    setCurrentState(state);
    playerControls?.seek(0);
  }, [doc, playerControls]);

  return {
    currentState,
    transitionTo,
    states,
  };
}
