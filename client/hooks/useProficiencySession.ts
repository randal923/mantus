import { useCallback, useState } from "react";
import type {
  ProficiencyActionFailedReason,
  ProficiencyStateMessage,
} from "@tibia/protocol";

export interface ProficiencySessionState {
  /** Latest server projection; pushed at login, on kills, and after selects. */
  readonly state: ProficiencyStateMessage | null;
  readonly pending: boolean;
  readonly error: ProficiencyActionFailedReason | null;
}

export interface ProficiencySession {
  readonly state: ProficiencySessionState;
  readonly stateReceived: (message: ProficiencyStateMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: ProficiencyActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: ProficiencySessionState = {
  state: null,
  pending: false,
  error: null,
};

/**
 * Holds the latest server weapon-proficiency projection. Experience accrual
 * and perk legality are all server-side; this state is a view over
 * `proficiency-state` messages.
 */
export function useProficiencySession(): ProficiencySession {
  const [state, setState] = useState<ProficiencySessionState>(initialState);

  const stateReceived = useCallback((message: ProficiencyStateMessage) => {
    setState({ state: message, pending: false, error: null });
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: ProficiencyActionFailedReason) => {
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
