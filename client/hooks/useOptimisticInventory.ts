import { useCallback, useRef, useState } from "react";
import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { applyPendingItemOp } from "../lib/inventory/applyPendingItemOp";
import { applyInventoryPrediction } from "../lib/inventory/applyInventoryPrediction";
import { buildPendingItemOpMessage } from "../lib/inventory/buildPendingItemOpMessage";
import { findInventoryItem } from "../lib/inventory/findInventoryItem";
import type { InventoryPrediction } from "../lib/inventory/InventoryPrediction";
import type {
  PendingItemOp,
  PendingItemOpIntent,
} from "../lib/inventory/PendingItemOp";
import type { ItemOpRejection } from "../lib/inventory/validateItemOp";

export interface OptimisticInventory {
  readonly inventory: InventoryState | null;
  /** Replaces all state on join/leave; discards any queued ops. */
  readonly reset: (state: InventoryState | null) => void;
  /** Applies a server inventory snapshot and sends the next queued op. */
  readonly confirm: (state: InventoryState) => void;
  /** Drops queued ops and re-renders the last server-confirmed state. */
  readonly rollback: () => void;
  /** Adjusts the server-confirmed state (e.g. capacity from progression). */
  readonly patch: (update: (state: InventoryState) => InventoryState) => void;
  /** Queues an external shop/storage prediction for optimistic rendering. */
  readonly preview: (prediction: InventoryPrediction) => boolean;
  /** Rejects the oldest external prediction and preserves later previews. */
  readonly rejectPreview: () => void;
  /** Drops every external prediction, such as when storage closes. */
  readonly clearPreviews: () => void;
  /** Reads one item from the latest authoritative inventory snapshot. */
  readonly getConfirmedItem: (itemId: string) => InventoryItem | null;
  /**
   * Queues an item op: renders it immediately, sends it when its turn comes.
   * Returns the client-side pre-check rejection instead of queueing when the
   * server would certainly refuse the op.
   */
  readonly dispatch: (op: PendingItemOp) => ItemOpRejection | null;
}

/**
 * Server-authoritative inventory with optimistic rendering. Drag operations
 * queue locally, while shop and storage actions use external preview queues.
 * `send` and `onDiscarded` must be referentially stable; `onDiscarded` fires
 * when a queued drag is dropped without reaching the server so callers can
 * undo related previews.
 */
export function useOptimisticInventory(
  send: (intent: PendingItemOpIntent) => boolean,
  onDiscarded?: (op: PendingItemOp) => void,
  validate?: (
    op: PendingItemOp,
    projected: InventoryState,
  ) => ItemOpRejection | null,
): OptimisticInventory {
  const [inventory, setInventory] = useState<InventoryState | null>(null);
  const serverStateRef = useRef<InventoryState | null>(null);
  const pendingRef = useRef<ReadonlyArray<PendingItemOp>>([]);
  const inFlightRef = useRef(false);
  const previewRef = useRef<ReadonlyArray<InventoryPrediction>>([]);

  const projectedState = useCallback((): InventoryState | null => {
    const serverState = serverStateRef.current;
    if (!serverState) return null;
    const dragged = pendingRef.current.reduce<InventoryState>(
      (state, op) => applyPendingItemOp(state, op) ?? state,
      serverState,
    );
    return previewRef.current.reduce<InventoryState>(
      (state, prediction) =>
        applyInventoryPrediction(state, prediction) ?? state,
      dragged,
    );
  }, []);

  const project = useCallback(() => {
    setInventory(projectedState());
  }, [projectedState]);

  const sendNext = useCallback(() => {
    while (!inFlightRef.current && previewRef.current.length === 0) {
      const [next] = pendingRef.current;
      const serverState = serverStateRef.current;
      if (!next || !serverState) return;
      const intent = buildPendingItemOpMessage(next, serverState);
      if (intent && send(intent)) {
        inFlightRef.current = true;
        return;
      }
      pendingRef.current = pendingRef.current.slice(1);
      onDiscarded?.(next);
    }
  }, [send, onDiscarded]);

  const reset = useCallback(
    (state: InventoryState | null) => {
      serverStateRef.current = state;
      pendingRef.current = [];
      inFlightRef.current = false;
      previewRef.current = [];
      project();
    },
    [project],
  );

  const confirm = useCallback(
    (state: InventoryState) => {
      serverStateRef.current = state;
      if (previewRef.current.length > 0) {
        previewRef.current = previewRef.current.slice(1);
      } else if (inFlightRef.current) {
        pendingRef.current = pendingRef.current.slice(1);
        inFlightRef.current = false;
      }
      sendNext();
      project();
    },
    [project, sendNext],
  );

  const rollback = useCallback(() => {
    if (
      !inFlightRef.current &&
      pendingRef.current.length === 0 &&
      previewRef.current.length === 0
    ) {
      return;
    }
    pendingRef.current = [];
    inFlightRef.current = false;
    previewRef.current = [];
    project();
  }, [project]);

  const preview = useCallback(
    (prediction: InventoryPrediction): boolean => {
      if (
        !serverStateRef.current ||
        inFlightRef.current ||
        pendingRef.current.length > 0 ||
        previewRef.current.length >= 100
      ) {
        return false;
      }
      const current = projectedState();
      if (!current) return false;
      const next = applyInventoryPrediction(current, prediction);
      if (!next) return false;
      previewRef.current = [...previewRef.current, prediction];
      setInventory(next);
      return true;
    },
    [projectedState],
  );

  const rejectPreview = useCallback(() => {
    if (previewRef.current.length === 0) return;
    previewRef.current = previewRef.current.slice(1);
    sendNext();
    project();
  }, [project, sendNext]);

  const clearPreviews = useCallback(() => {
    if (previewRef.current.length === 0) return;
    previewRef.current = [];
    sendNext();
    project();
  }, [project, sendNext]);

  const getConfirmedItem = useCallback((itemId: string) => {
    const state = serverStateRef.current;
    return state ? findInventoryItem(state, itemId) : null;
  }, []);

  const patch = useCallback(
    (update: (state: InventoryState) => InventoryState) => {
      const serverState = serverStateRef.current;
      if (!serverState) return;
      serverStateRef.current = update(serverState);
      project();
    },
    [project],
  );

  const dispatch = useCallback(
    (op: PendingItemOp): ItemOpRejection | null => {
      if (!serverStateRef.current) return null;
      if (previewRef.current.length > 0) {
        onDiscarded?.(op);
        return null;
      }
      const projected = projectedState();
      if (projected && validate) {
        const rejection = validate(op, projected);
        if (rejection) return rejection;
      }
      pendingRef.current = [...pendingRef.current, op];
      sendNext();
      project();
      return null;
    },
    [onDiscarded, project, projectedState, sendNext, validate],
  );

  return {
    inventory,
    reset,
    confirm,
    rollback,
    patch,
    preview,
    rejectPreview,
    clearPreviews,
    getConfirmedItem,
    dispatch,
  };
}
