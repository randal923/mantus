import { useCallback, useState } from "react";
import type {
  HighscoresActionFailedReason,
  HighscoresStateMessage,
} from "@tibia/protocol";

export interface HighscoresSessionState {
  readonly page: HighscoresStateMessage | null;
  readonly pending: boolean;
  readonly error: HighscoresActionFailedReason | null;
}

export interface HighscoresSession {
  readonly state: HighscoresSessionState;
  readonly stateReceived: (message: HighscoresStateMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: HighscoresActionFailedReason) => void;
  readonly reset: () => void;
}

const initialState: HighscoresSessionState = {
  page: null,
  pending: false,
  error: null,
};

/** Holds the latest server highscore page; ranking is fully server-side. */
export function useHighscoresSession(): HighscoresSession {
  const [state, setState] = useState<HighscoresSessionState>(initialState);

  const stateReceived = useCallback((message: HighscoresStateMessage) => {
    setState({ page: message, pending: false, error: null });
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: HighscoresActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, stateReceived, begin, fail, reset };
}
