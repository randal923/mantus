import { useCallback, useState } from "react";
import type {
  WheelActionFailedReason,
  WheelStateMessage,
} from "@tibia/protocol";

export interface WheelSessionState {
  /** Latest server projection; every save is acknowledged with a fresh one. */
  readonly wheel: WheelStateMessage | null;
  readonly pending: boolean;
  readonly error: WheelActionFailedReason | null;
}

export interface WheelSession {
  readonly state: WheelSessionState;
  readonly stateReceived: (message: WheelStateMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: WheelActionFailedReason) => void;
  readonly reset: () => void;
}

const initialState: WheelSessionState = {
  wheel: null,
  pending: false,
  error: null,
};

/** Holds the latest server wheel projection; all rules are server-side. */
export function useWheelSession(): WheelSession {
  const [state, setState] = useState<WheelSessionState>(initialState);

  const stateReceived = useCallback((message: WheelStateMessage) => {
    setState({ wheel: message, pending: false, error: null });
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: WheelActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, stateReceived, begin, fail, reset };
}
