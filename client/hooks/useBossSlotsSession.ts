import { useCallback, useState } from "react";
import type {
  BossSlotFailedReason,
  BossSlotsStateMessage,
} from "@tibia/protocol";

export interface BossSlotsSessionState {
  /** Latest server projection; re-sent after every slot mutation. */
  readonly state: BossSlotsStateMessage | null;
  readonly pending: boolean;
  readonly error: BossSlotFailedReason | null;
}

export interface BossSlotsSession {
  readonly state: BossSlotsSessionState;
  readonly stateReceived: (message: BossSlotsStateMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: BossSlotFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: BossSlotsSessionState = {
  state: null,
  pending: false,
  error: null,
};

/** Holds the latest server boss-slot projection; unlocks are server-side. */
export function useBossSlotsSession(): BossSlotsSession {
  const [state, setState] = useState<BossSlotsSessionState>(initialState);

  const stateReceived = useCallback((message: BossSlotsStateMessage) => {
    setState({ state: message, pending: false, error: null });
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: BossSlotFailedReason) => {
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
