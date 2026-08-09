import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { ItemLocation } from "../ItemLocation";
import { ITEM_POUCH_TYPE_ID } from "../itemPouchTypeId";
import { canMergeItems } from "./canMergeItems";
import { subtreeHeight } from "./subtreeHeight";

const MAX_CONTAINER_DEPTH = 8;

/**
 * Where destination-less loot lands when the character carries a Loot Pouch:
 * the pouch, always. The pouch normally sits in the bound container, but any
 * equipment-rooted spot (a legacy pouch still in the backpack tree) works. A
 * stackable item tops up a partial stack already in the pouch before opening
 * a new one; anything else takes the pouch's first free slot. Returns null
 * when there is no carried pouch (or the incoming subtree would nest too
 * deep), which callers treat as "fall back to normal backpack placement".
 */
export function planItemPouchPlacement(input: {
  readonly catalog: ItemCatalog;
  /** The character's carried rows. */
  readonly carried: ReadonlyArray<Item>;
  /** The item being placed. */
  readonly item: Item;
  /** That item plus everything nested inside it, for the depth check. */
  readonly subtree: ReadonlyArray<Item>;
}): { readonly location: ItemLocation; readonly mergeTarget?: Item } | null {
  const { catalog, carried, item } = input;
  const pouch = carried.find(
    (candidate) => candidate.typeId === ITEM_POUCH_TYPE_ID,
  );
  if (!pouch) return null;
  const carriedById = new Map(carried.map((entry) => [entry.id, entry]));
  let depth = 0;
  let cursor: Item = pouch;
  while (cursor.location.kind === "container") {
    if (depth >= MAX_CONTAINER_DEPTH) return null;
    const parent = carriedById.get(cursor.location.containerId);
    if (!parent) return null;
    cursor = parent;
    depth += 1;
  }
  if (cursor.location.kind !== "equipment") return null;
  const height = subtreeHeight(input.subtree, item.id);
  if (depth + 1 + height > MAX_CONTAINER_DEPTH) return null;
  const capacity = catalog.require(pouch.typeId).containerCapacity ?? 0;
  if (capacity < 1) return null;
  const contents = carried
    .filter(
      (candidate) =>
        candidate.location.kind === "container" &&
        candidate.location.containerId === pouch.id,
    )
    .sort((left, right) => slotOf(left) - slotOf(right));

  if (catalog.require(item.typeId).stackable) {
    const mergeTarget = contents.find((candidate) =>
      canMergeItems(catalog, item, candidate, item.count),
    );
    if (mergeTarget) return { location: mergeTarget.location, mergeTarget };
  }

  const occupiedSlots = new Set(contents.map(slotOf));
  for (let slot = 0; slot < capacity; slot++) {
    if (occupiedSlots.has(slot)) continue;
    return {
      location: { kind: "container", containerId: pouch.id, slot },
    };
  }
  return null;
}

function slotOf(item: Item): number {
  return item.location.kind === "container" ? item.location.slot : 0;
}
