import { positionKey } from "../positionKey";
import { QUEST_TOUCH_ACTIONS } from "./questTouchTables";

const tiles = new Map<string, number>();
for (const touch of QUEST_TOUCH_ACTIONS.values()) {
  for (const removal of touch.removals) {
    tiles.set(positionKey(removal.position), removal.itemId);
  }
}

/**
 * Tiles whose passability is owned by a quest-touch removable item, keyed by
 * `positionKey` with the expected item type id. The static navigation bitset
 * baked the item's placed (blocking) state, so `DynamicMapItems` overlays
 * "walkable while absent" the same way it does for doors and shovel holes.
 */
export const QUEST_TOUCH_WALL_TILES: ReadonlyMap<string, number> = tiles;
