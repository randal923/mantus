import { useCallback, useState } from "react";
import type {
  OutfitActionFailedReason,
  OutfitStateMessage,
} from "@tibia/protocol";

export interface OutfitSessionState {
  /** Latest server projection; every select is answered with a fresh one. */
  readonly outfit: OutfitStateMessage | null;
  readonly pending: boolean;
  readonly error: OutfitActionFailedReason | null;
}

export interface OutfitSession {
  readonly state: OutfitSessionState;
  readonly stateReceived: (message: OutfitStateMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: OutfitActionFailedReason) => void;
  readonly reset: () => void;
}

const initialState: OutfitSessionState = {
  outfit: null,
  pending: false,
  error: null,
};

/** Holds the own entitled outfits and mounts; all rules are server-side. */
export function useOutfitSession(): OutfitSession {
  const [state, setState] = useState<OutfitSessionState>(initialState);

  const stateReceived = useCallback((message: OutfitStateMessage) => {
    setState({ outfit: message, pending: false, error: null });
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: OutfitActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, stateReceived, begin, fail, reset };
}
