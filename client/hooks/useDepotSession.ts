import { useCallback, useRef, useState } from "react";
import type {
  DepotActionFailedReason,
  DepotStateMessage,
} from "@tibia/protocol";
import type { DepotAction } from "../lib/depot/DepotAction";

const MAX_QUEUED_ACTIONS = 20;

export interface DepotSessionState {
  readonly state: DepotStateMessage;
  readonly pending: boolean;
  readonly error: DepotActionFailedReason | null;
}

export interface DepotSession {
  readonly session: DepotSessionState | null;
  readonly confirm: (state: DepotStateMessage) => void;
  readonly fail: (reason: DepotActionFailedReason) => void;
  readonly beginBrowse: (sent: boolean) => void;
  readonly enqueue: (action: DepotAction) => void;
  /** Surfaces a client-side pre-check failure without touching the queue. */
  readonly reject: (reason: DepotActionFailedReason) => void;
  readonly close: () => void;
  readonly reset: () => void;
}

/**
 * Serializes depot actions against the latest server state. The server is
 * memory-authoritative and replies within a tick, so the UI renders server
 * state directly; the queue only bridges the short network round trip.
 */
export function useDepotSession(
  send: (action: DepotAction, state: DepotStateMessage) => boolean,
): DepotSession {
  const [session, setSession] = useState<DepotSessionState | null>(null);
  const serverStateRef = useRef<DepotStateMessage | null>(null);
  const queueRef = useRef<ReadonlyArray<DepotAction>>([]);
  const actionInFlightRef = useRef(false);
  const browseInFlightRef = useRef(false);
  const errorRef = useRef<DepotActionFailedReason | null>(null);

  const publish = useCallback(() => {
    const state = serverStateRef.current;
    if (!state) {
      setSession(null);
      return;
    }
    setSession({
      state,
      pending:
        actionInFlightRef.current ||
        browseInFlightRef.current ||
        queueRef.current.length > 0,
      error: errorRef.current,
    });
  }, []);

  const sendNext = useCallback(() => {
    while (!actionInFlightRef.current && !browseInFlightRef.current) {
      const state = serverStateRef.current;
      const [action] = queueRef.current;
      if (!state || !action) return;
      queueRef.current = queueRef.current.slice(1);
      if (send(action, state)) {
        actionInFlightRef.current = true;
        publish();
        return;
      }
      errorRef.current = "failed";
      publish();
    }
  }, [publish, send]);

  const reset = useCallback(() => {
    serverStateRef.current = null;
    queueRef.current = [];
    actionInFlightRef.current = false;
    browseInFlightRef.current = false;
    errorRef.current = null;
    setSession(null);
  }, []);

  const confirm = useCallback(
    (state: DepotStateMessage) => {
      if (serverStateRef.current?.sessionId !== state.sessionId) {
        queueRef.current = [];
      }
      serverStateRef.current = state;
      actionInFlightRef.current = false;
      browseInFlightRef.current = false;
      errorRef.current = null;
      publish();
      sendNext();
    },
    [publish, sendNext],
  );

  const fail = useCallback(
    (reason: DepotActionFailedReason) => {
      if (reason === "out-of-range") {
        reset();
        return;
      }
      queueRef.current = [];
      actionInFlightRef.current = false;
      browseInFlightRef.current = false;
      errorRef.current = reason;
      publish();
    },
    [publish, reset],
  );

  const beginBrowse = useCallback(
    (sent: boolean) => {
      browseInFlightRef.current = sent;
      errorRef.current = sent ? null : "failed";
      publish();
    },
    [publish],
  );

  const enqueue = useCallback(
    (action: DepotAction) => {
      if (
        !serverStateRef.current ||
        queueRef.current.length >= MAX_QUEUED_ACTIONS
      ) {
        errorRef.current = "busy";
        publish();
        return;
      }
      queueRef.current = [...queueRef.current, action];
      errorRef.current = null;
      publish();
      sendNext();
    },
    [publish, sendNext],
  );

  const reject = useCallback(
    (reason: DepotActionFailedReason) => {
      errorRef.current = reason;
      publish();
    },
    [publish],
  );

  return {
    session,
    confirm,
    fail,
    beginBrowse,
    enqueue,
    reject,
    close: reset,
    reset,
  };
}
