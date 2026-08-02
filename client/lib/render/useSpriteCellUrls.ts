"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ItemIconPiece } from "./getItemIconPieces";
import { spriteCellIconStore } from "./spriteCellIconStore";

/**
 * The blob URL for each piece of one item icon, in piece order; null until
 * that sprite's crop is ready. Subscribing requests crops for every sprite the
 * appearance can show, so an animation never advances onto a phase whose crop
 * has not been prepared, and the store's revision re-renders the icon as crops
 * land.
 */
export function useSpriteCellUrls(
  pieces: ReadonlyArray<ItemIconPiece>,
  allSprites: ReadonlyArray<number>,
): Array<string | null> {
  const key = [...pieces.map((piece) => piece.spriteId), ...allSprites].join(
    ":",
  );
  const subscribe = useCallback(
    (listener: () => void) =>
      spriteCellIconStore.subscribe(key.split(":").map(Number), listener),
    [key],
  );
  useSyncExternalStore(
    subscribe,
    () => spriteCellIconStore.revision(),
    () => 0,
  );
  return pieces.map((piece) => spriteCellIconStore.url(piece.spriteId));
}
