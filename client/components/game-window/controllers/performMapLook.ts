import type { Position } from "@tibia/protocol";
import type { GameWindowStore } from "../types/GameWindowStore";

/**
 * Sends the look intent for a clicked tile. The description itself is composed
 * by the server and arrives as `look-text`; the client only says what was
 * pointed at.
 */
export function performMapLook(
  store: GameWindowStore,
  position: Position,
  creatureId: string | null,
  itemIds: ReadonlyArray<number>,
): void {
  const client = store.getState().runtime.clientRef.current;
  if (!client) return;
  if (creatureId) {
    client.look({ kind: "creature", creatureId });
    return;
  }
  // The stack is drawn bottom-up, so the last entry is the topmost sprite —
  // the thing Tibia looks at.
  const itemId = itemIds[itemIds.length - 1];
  client.look({
    kind: "map",
    position,
    ...(itemId === undefined ? {} : { itemId }),
  });
}
