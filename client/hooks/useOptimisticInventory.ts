import { useCallback, useRef, useState } from "react";
import type { InventoryState } from "@tibia/protocol";
import { applyPendingItemOp } from "../lib/inventory/applyPendingItemOp";
import { buildPendingItemOpMessage } from "../lib/inventory/buildPendingItemOpMessage";
import type {
  PendingItemOp,
  PendingItemOpIntent,
} from "../lib/inventory/PendingItemOp";

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
  /** Queues an item op: renders it immediately, sends it when its turn comes. */
  readonly dispatch: (op: PendingItemOp) => void;
}

/**
 * Server-authoritative inventory with optimistic drag rendering. The server
 * allows one in-flight item operation per session, so ops queue locally and
 * are sent one at a time with revisions resolved from the latest confirmed
 * state. `send` and `onDiscarded` must be referentially stable; `onDiscarded`
 * fires when a queued op is dropped without reaching the server (stale
 * target or closed socket) so callers can undo side effects such as map
 * previews.
 */
export function useOptimisticInventory(
  send: (intent: PendingItemOpIntent) => boolean,
  onDiscarded?: (op: PendingItemOp) => void,
): OptimisticInventory {
  const [inventory, setInventory] = useState<InventoryState | null>(null);
  const serverStateRef = useRef<InventoryState | null>(null);
  const pendingRef = useRef<ReadonlyArray<PendingItemOp>>([]);
  const inFlightRef = useRef(false);

  const project = useCallback(() => {
    const serverState = serverStateRef.current;
    if (!serverState) {
      setInventory(null);
      return;
    }
    setInventory(
      pendingRef.current.reduce<InventoryState>(
        (state, op) => applyPendingItemOp(state, op) ?? state,
        serverState,
      ),
    );
  }, []);

  const sendNext = useCallback(() => {
    while (!inFlightRef.current) {
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
      project();
    },
    [project],
  );

  const confirm = useCallback(
    (state: InventoryState) => {
      serverStateRef.current = state;
      if (inFlightRef.current) {
        pendingRef.current = pendingRef.current.slice(1);
        inFlightRef.current = false;
      }
      sendNext();
      project();
    },
    [project, sendNext],
  );

  const rollback = useCallback(() => {
    if (!inFlightRef.current && pendingRef.current.length === 0) return;
    pendingRef.current = [];
    inFlightRef.current = false;
    project();
  }, [project]);

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
    (op: PendingItemOp) => {
      if (!serverStateRef.current) return;
      pendingRef.current = [...pendingRef.current, op];
      sendNext();
      project();
    },
    [project, sendNext],
  );

  return { inventory, reset, confirm, rollback, patch, dispatch };
}
