"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getItemIconPieces, type ItemIconFrame } from "./getItemIconPieces";
import { getSharedAssetStore } from "./getSharedAssetStore";
import { itemIconAnimationStore } from "./itemIconAnimationStore";

/**
 * The pieces one item icon draws this instant: its animation phase, its stack
 * size art, and every 32×32 piece of a multi-tile item. Falls back to the plain
 * sprite id — the previous behaviour — until the object catalog is loaded, or for
 * an icon whose appearance cannot be resolved.
 *
 * Passing the item's client id resolves its appearance authoritatively; without
 * one the sprite id alone works for every sprite that belongs to exactly one
 * appearance.
 */
export function useItemIcon(
  spriteId: number,
  clientId?: number,
  count = 1,
): ItemIconFrame {
  const subscribe = useCallback(
    (listener: () => void) =>
      itemIconAnimationStore.subscribe(clientId, spriteId, listener),
    [clientId, spriteId],
  );
  // Subscribed for the re-render alone: the store's revision changes whenever
  // this icon's phase, or the catalog behind it, moves on.
  useSyncExternalStore(
    subscribe,
    () => itemIconAnimationStore.revision(),
    () => 0,
  );
  const { appearance, phase } = itemIconAnimationStore.frame(clientId, spriteId);
  if (!appearance) {
    return { columns: 1, rows: 1, pieces: [{ spriteId, column: 0, row: 0 }] };
  }
  const frame = getItemIconPieces(
    getSharedAssetStore(),
    appearance,
    phase,
    count,
  );
  return frame.pieces.length > 0
    ? frame
    : { columns: 1, rows: 1, pieces: [{ spriteId, column: 0, row: 0 }] };
}
