"use client";

import { useCallback, useState } from "react";
import type {
  GemActionFailedReason,
  GemStateMessage,
} from "@tibia/protocol";

export interface GemSessionState {
  /** Latest server projection; every action is acknowledged with one. */
  readonly gems: GemStateMessage | null;
  readonly pending: boolean;
  readonly error: GemActionFailedReason | null;
}

export interface GemSession {
  readonly state: GemSessionState;
  readonly stateReceived: (message: GemStateMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: GemActionFailedReason) => void;
  readonly reset: () => void;
}

const initialState: GemSessionState = {
  gems: null,
  pending: false,
  error: null,
};

/** Holds the latest gem atelier projection; all rules are server-side. */
export function useGemSession(): GemSession {
  const [state, setState] = useState<GemSessionState>(initialState);

  const stateReceived = useCallback((message: GemStateMessage) => {
    setState({ gems: message, pending: false, error: null });
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: GemActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, stateReceived, begin, fail, reset };
}
