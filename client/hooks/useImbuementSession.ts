import { useCallback, useState } from "react";
import type {
  ImbuementActionFailedReason,
  ImbuementWindowStateMessage,
} from "@tibia/protocol";

export interface ImbuementSessionState {
  /** Server-composed window projection for one carried item. */
  readonly window: ImbuementWindowStateMessage | null;
  readonly pending: boolean;
  readonly error: ImbuementActionFailedReason | null;
}

export interface ImbuementSession {
  readonly state: ImbuementSessionState;
  readonly windowReceived: (message: ImbuementWindowStateMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: ImbuementActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: ImbuementSessionState = {
  window: null,
  pending: false,
  error: null,
};

/**
 * Holds the latest imbuement window projection. Prices, materials, and the
 * canApply verdicts are all server-authored; the client only renders them.
 */
export function useImbuementSession(): ImbuementSession {
  const [state, setState] = useState<ImbuementSessionState>(initialState);

  const windowReceived = useCallback(
    (message: ImbuementWindowStateMessage) => {
      setState({ window: message, pending: false, error: null });
    },
    [],
  );

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: ImbuementActionFailedReason) => {
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

  return { state, windowReceived, begin, fail, dismissError, reset };
}
