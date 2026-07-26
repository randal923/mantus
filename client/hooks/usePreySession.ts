import { useCallback, useState } from "react";
import type {
  PreyActionFailedReason,
  PreyStateMessage,
} from "@tibia/protocol";

export interface PreySessionState {
  /** Latest server projection; pushed at login and after every mutation. */
  readonly state: PreyStateMessage | null;
  readonly pending: boolean;
  readonly error: PreyActionFailedReason | null;
}

export interface PreySession {
  readonly state: PreySessionState;
  readonly stateReceived: (message: PreyStateMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: PreyActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: PreySessionState = {
  state: null,
  pending: false,
  error: null,
};

/**
 * Holds the latest server prey projection. Rolls, prices, and balances are
 * all server-side; this state is a view over `prey-state` messages.
 */
export function usePreySession(): PreySession {
  const [state, setState] = useState<PreySessionState>(initialState);

  const stateReceived = useCallback((message: PreyStateMessage) => {
    setState({ state: message, pending: false, error: null });
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: PreyActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const dismissError = useCallback(() => {
    setState((current) =>
      current.error ? { ...current, error: null } : current,
    );
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, stateReceived, begin, fail, dismissError, reset };
}
