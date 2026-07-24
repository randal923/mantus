import type { MapItem } from "../../MapItem";
import type { ItemCatalog } from "../ItemCatalog";

/** Canary's CONST_ME_POFF: the puff shown when an item is dropped into trash. */
export const TRASH_DESTRUCTION_EFFECT_ID = 3;

/**
 * True when a destination tile is a trashholder (dustbin, sewer grate, or a
 * water/lava/tar liquid): items dropped or thrown here are destroyed, not
 * placed. Keyed off the catalog kind of every item on the tile — the liquids
 * are static map scenery with no world item to inspect (recorded 2026-07-20),
 * so `getMapItems` (statics + dynamics) is the right surface to check.
 */
export function isTrashholderTile(
  tileItems: ReadonlyArray<MapItem>,
  catalog: ItemCatalog,
): boolean {
  return tileItems.some(
    (item) => catalog.get(item.itemId)?.kind === "trashholder",
  );
}
