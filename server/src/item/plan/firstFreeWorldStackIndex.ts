import type { MapItem } from "../../MapItem";

const MAX_TILE_ITEMS = 16;

export function firstFreeWorldStackIndex(
  tileItems: ReadonlyArray<MapItem>,
): number | null {
  const occupied = new Set(tileItems.map((item) => item.stackIndex));
  for (let index = 0; index < MAX_TILE_ITEMS; index++) {
    if (!occupied.has(index)) return index;
  }
  return null;
}
