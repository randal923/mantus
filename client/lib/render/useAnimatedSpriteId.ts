"use client";

import { useCallback, useSyncExternalStore } from "react";
import { itemSpriteAnimationStore } from "./itemSpriteAnimationStore";

/**
 * Resolves the sprite an item icon should draw this instant. Items with a
 * single phase — most of them — return their own id and never re-render.
 * Passing the item's client id resolves its schedule authoritatively; without
 * one the sprite id alone works for every sprite that belongs to exactly one
 * schedule.
 */
export function useAnimatedSpriteId(spriteId: number, clientId?: number): number {
  const subscribe = useCallback(
    (listener: () => void) =>
      itemSpriteAnimationStore.subscribe({ clientId, spriteId }, listener),
    [clientId, spriteId],
  );
  return useSyncExternalStore(
    subscribe,
    () => itemSpriteAnimationStore.currentSpriteId({ clientId, spriteId }),
    () => spriteId,
  );
}
