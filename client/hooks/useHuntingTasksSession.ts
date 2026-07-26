import { useCallback, useState } from "react";
import type {
  TaskHuntingActionFailedReason,
  TaskHuntingStateMessage,
} from "@tibia/protocol";

export interface HuntingTasksSessionState {
  /** Latest server projection; pushed at login and after every mutation. */
  readonly state: TaskHuntingStateMessage | null;
  readonly pending: boolean;
  readonly error: TaskHuntingActionFailedReason | null;
}

export interface HuntingTasksSession {
  readonly state: HuntingTasksSessionState;
  readonly stateReceived: (message: TaskHuntingStateMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: TaskHuntingActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: HuntingTasksSessionState = {
  state: null,
  pending: false,
  error: null,
};

/**
 * Holds the latest server hunting-task projection. Kill goals, rewards, and
 * exhausts are all server-side; this state is a view over
 * `hunting-tasks-state` messages.
 */
export function useHuntingTasksSession(): HuntingTasksSession {
  const [state, setState] = useState<HuntingTasksSessionState>(initialState);

  const stateReceived = useCallback((message: TaskHuntingStateMessage) => {
    setState({ state: message, pending: false, error: null });
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: TaskHuntingActionFailedReason) => {
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
