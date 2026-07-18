import { useCallback, useRef, useState } from "react";
import type {
  DepotActionFailedReason,
  DepotStateMessage,
} from "@tibia/protocol";
import { applyDepotPrediction } from "../lib/depot/applyDepotPrediction";
import type { QueuedDepotAction } from "../lib/depot/QueuedDepotAction";
import type { InventoryPrediction } from "../lib/inventory/InventoryPrediction";

export interface OptimisticDepotSession {
  readonly state: DepotStateMessage;
  readonly navigationPending: boolean;
  readonly actionsDisabled: boolean;
  readonly error: DepotActionFailedReason | null;
}

export interface OptimisticDepot {
  readonly session: OptimisticDepotSession | null;
  readonly confirm: (state: DepotStateMessage) => void;
  readonly fail: (reason: DepotActionFailedReason) => void;
  readonly beginBrowse: (sent: boolean) => void;
  readonly enqueue: (action: QueuedDepotAction) => boolean;
  /** Surfaces a client-side pre-check failure without touching the queue. */
  readonly reject: (reason: DepotActionFailedReason) => void;
  readonly close: () => void;
  readonly reset: () => void;
}

export function useOptimisticDepot(
  send: (action: QueuedDepotAction, state: DepotStateMessage) => boolean,
  previewInventory: (prediction: InventoryPrediction) => boolean,
  rejectInventoryPreview: () => void,
  clearInventoryPreviews: () => void,
): OptimisticDepot {
  const [session, setSession] = useState<OptimisticDepotSession | null>(null);
  const serverStateRef = useRef<DepotStateMessage | null>(null);
  const queueRef = useRef<ReadonlyArray<QueuedDepotAction>>([]);
  const mutationInFlightRef = useRef(false);
  const browseInFlightRef = useRef(false);
  const waitingForRefreshRef = useRef(false);
  const errorRef = useRef<DepotActionFailedReason | null>(null);

  const publish = useCallback(() => {
    const serverState = serverStateRef.current;
    if (!serverState) {
      setSession(null);
      return;
    }
    const state = queueRef.current.reduce<DepotStateMessage>(
      (current, action) =>
        applyDepotPrediction(current, action.depotPrediction),
      serverState,
    );
    setSession({
      state,
      navigationPending:
        browseInFlightRef.current ||
        waitingForRefreshRef.current ||
        queueRef.current.length > 0,
      actionsDisabled:
        browseInFlightRef.current || waitingForRefreshRef.current,
      error: errorRef.current,
    });
  }, []);

  const sendNext = useCallback(() => {
    while (
      !mutationInFlightRef.current &&
      !browseInFlightRef.current &&
      !waitingForRefreshRef.current
    ) {
      const state = serverStateRef.current;
      const [action] = queueRef.current;
      if (!state || !action) return;
      if (send(action, state)) {
        mutationInFlightRef.current = true;
        publish();
        return;
      }
      queueRef.current = queueRef.current.slice(1);
      rejectInventoryPreview();
      errorRef.current = "failed";
      publish();
    }
  }, [publish, rejectInventoryPreview, send]);

  const reset = useCallback(() => {
    const hadPredictions = queueRef.current.length > 0;
    serverStateRef.current = null;
    queueRef.current = [];
    mutationInFlightRef.current = false;
    browseInFlightRef.current = false;
    waitingForRefreshRef.current = false;
    errorRef.current = null;
    if (hadPredictions) clearInventoryPreviews();
    setSession(null);
  }, [clearInventoryPreviews]);

  const confirm = useCallback(
    (state: DepotStateMessage) => {
      const current = serverStateRef.current;
      if (!current || current.sessionId !== state.sessionId) {
        if (queueRef.current.length > 0) clearInventoryPreviews();
        queueRef.current = [];
        mutationInFlightRef.current = false;
      } else if (mutationInFlightRef.current) {
        queueRef.current = queueRef.current.slice(1);
        mutationInFlightRef.current = false;
      }
      serverStateRef.current = state;
      browseInFlightRef.current = false;
      waitingForRefreshRef.current = false;
      errorRef.current = null;
      publish();
      sendNext();
    },
    [clearInventoryPreviews, publish, sendNext],
  );

  const fail = useCallback(
    (reason: DepotActionFailedReason) => {
      if (reason === "out-of-range") {
        reset();
        return;
      }
      if (mutationInFlightRef.current) {
        queueRef.current = queueRef.current.slice(1);
        mutationInFlightRef.current = false;
        rejectInventoryPreview();
        waitingForRefreshRef.current = reason === "stale";
      } else {
        browseInFlightRef.current = false;
      }
      errorRef.current = reason;
      publish();
      if (!waitingForRefreshRef.current) sendNext();
    },
    [publish, rejectInventoryPreview, reset, sendNext],
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
    (action: QueuedDepotAction): boolean => {
      if (
        !serverStateRef.current ||
        browseInFlightRef.current ||
        queueRef.current.length >= 100 ||
        !previewInventory(action.inventoryPrediction)
      ) {
        errorRef.current = "busy";
        publish();
        return false;
      }
      queueRef.current = [...queueRef.current, action];
      errorRef.current = null;
      publish();
      sendNext();
      return true;
    },
    [previewInventory, publish, sendNext],
  );

  const reject = useCallback(
    (reason: DepotActionFailedReason) => {
      errorRef.current = reason;
      publish();
    },
    [publish],
  );

  const close = useCallback(() => {
    reset();
  }, [reset]);

  return {
    session,
    confirm,
    fail,
    beginBrowse,
    enqueue,
    reject,
    close,
    reset,
  };
}
