import { useCallback, useState } from "react";
import type { AnimusStateMessage } from "@tibia/protocol";

export interface AnimusSessionState {
  /** Mastered races and the current bonus; pushed at login and on grants. */
  readonly state: AnimusStateMessage | null;
}

export interface AnimusSession {
  readonly state: AnimusSessionState;
  readonly stateReceived: (message: AnimusStateMessage) => void;
  readonly reset: () => void;
}

const initialState: AnimusSessionState = { state: null };

/** Holds the server's animus mastery projection (display only). */
export function useAnimusSession(): AnimusSession {
  const [state, setState] = useState<AnimusSessionState>(initialState);

  const stateReceived = useCallback((message: AnimusStateMessage) => {
    setState({ state: message });
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, stateReceived, reset };
}
