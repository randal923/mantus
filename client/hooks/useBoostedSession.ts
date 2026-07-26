import { useCallback, useState } from "react";
import type { BoostedStateMessage } from "@tibia/protocol";

export interface BoostedSessionState {
  /** Today's boosted pair; pushed at login and on each daily rotation. */
  readonly state: BoostedStateMessage | null;
}

export interface BoostedSession {
  readonly state: BoostedSessionState;
  readonly stateReceived: (message: BoostedStateMessage) => void;
  readonly reset: () => void;
}

const initialState: BoostedSessionState = { state: null };

/** Holds the server's boosted creature/boss announcement (display only). */
export function useBoostedSession(): BoostedSession {
  const [state, setState] = useState<BoostedSessionState>(initialState);

  const stateReceived = useCallback((message: BoostedStateMessage) => {
    setState({ state: message });
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, stateReceived, reset };
}
