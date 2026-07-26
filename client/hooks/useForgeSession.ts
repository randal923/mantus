import { useCallback, useState } from "react";
import type {
  ForgeActionFailedReason,
  ForgeHistoryStateMessage,
  ForgeResultMessage,
  ForgeStateMessage,
} from "@tibia/protocol";

export interface ForgeSessionState {
  /** Own resource balances; pushed at login and after every mutation. */
  readonly state: ForgeStateMessage | null;
  readonly history: ForgeHistoryStateMessage | null;
  /** Outcome of the last fusion/transfer, until dismissed. */
  readonly result: ForgeResultMessage | null;
  readonly pending: boolean;
  readonly error: ForgeActionFailedReason | null;
}

export interface ForgeSession {
  readonly state: ForgeSessionState;
  readonly stateReceived: (message: ForgeStateMessage) => void;
  readonly historyReceived: (message: ForgeHistoryStateMessage) => void;
  readonly resultReceived: (message: ForgeResultMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: ForgeActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly dismissResult: () => void;
  readonly reset: () => void;
}

const initialState: ForgeSessionState = {
  state: null,
  history: null,
  result: null,
  pending: false,
  error: null,
};

/**
 * Holds the latest server forge projections. Rolls, costs, and balances are
 * all server-side; this state is a view over forge-* messages.
 */
export function useForgeSession(): ForgeSession {
  const [state, setState] = useState<ForgeSessionState>(initialState);

  const stateReceived = useCallback((message: ForgeStateMessage) => {
    setState((current) => ({
      ...current,
      state: message,
      pending: false,
      error: null,
    }));
  }, []);

  const historyReceived = useCallback(
    (message: ForgeHistoryStateMessage) => {
      setState((current) => ({
        ...current,
        history: message,
        pending: false,
        error: null,
      }));
    },
    [],
  );

  const resultReceived = useCallback((message: ForgeResultMessage) => {
    setState((current) => ({
      ...current,
      result: message,
      pending: false,
      error: null,
    }));
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      result: sent ? null : current.result,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: ForgeActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const dismissError = useCallback(() => {
    setState((current) =>
      current.error ? { ...current, error: null } : current,
    );
  }, []);

  const dismissResult = useCallback(() => {
    setState((current) =>
      current.result ? { ...current, result: null } : current,
    );
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    stateReceived,
    historyReceived,
    resultReceived,
    begin,
    fail,
    dismissError,
    dismissResult,
    reset,
  };
}
