import type { Position } from "@tibia/protocol";
import type { MapItem } from "../../MapItem";
import type { ItemCatalog } from "../ItemCatalog";
import type { WorldItemsView } from "./WorldItemsView";

/** Canary's CONST_ME_POFF: the puff shown when an item is dropped into trash. */
export const TRASH_DESTRUCTION_EFFECT_ID = 3;

/**
 * True when a destination tile is a trashholder (dustbin, sewer grate, or a
 * water/lava/tar liquid): items dropped or thrown here are destroyed, not
 * placed. Keyed off the catalog kind of every item on the tile — used for
 * dynamic placements (a dustbin someone moved) and hand-seeded tests.
 */
export function isTrashholderTile(
  tileItems: ReadonlyArray<MapItem>,
  catalog: ItemCatalog,
): boolean {
  return tileItems.some(
    (item) => catalog.get(item.itemId)?.kind === "trashholder",
  );
}

/**
 * The trashholder type governing a destination tile, if any. Liquid grounds
 * are static client scenery with no MapItem (recorded 2026-07-20), so the
 * static side channel is consulted first; movable dustbins and hand-seeded
 * water still resolve through the tile's items.
 */
export function trashholderTypeAt(
  world: WorldItemsView,
  catalog: ItemCatalog,
  position: Position,
): number | undefined {
  const staticType = world.trashholderTypeAt?.(position);
  if (staticType !== undefined) return staticType;
  return world
    .getMapItems(position)
    .find((item) => catalog.get(item.itemId)?.kind === "trashholder")?.itemId;
}

/**
 * The magic effect a trashholder shows on destruction: its items.xml effect
 * (water's blue rings, lava's fire) when configured, the generic poff
 * otherwise. Canary is silent for unconfigured trashholders; the poff is a
 * deliberate feedback deviation.
 */
export function trashDestructionEffectId(
  catalog: ItemCatalog,
  trashTypeId: number | undefined,
): number {
  if (trashTypeId === undefined) return TRASH_DESTRUCTION_EFFECT_ID;
  return catalog.get(trashTypeId)?.trashEffectId ?? TRASH_DESTRUCTION_EFFECT_ID;
}
