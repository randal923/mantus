import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { ItemLocation } from "../ItemLocation";
import { ITEM_POUCH_TYPE_ID } from "../itemPouchTypeId";
import { backpackContainers } from "./backpackContainers";
import { canMergeItems } from "./canMergeItems";
import { subtreeHeight } from "./subtreeHeight";

const MAX_CONTAINER_DEPTH = 8;

/**
 * Where destination-less loot lands when the player carries an Item Pouch
 * inside the equipped backpack tree: the pouch, always. A stackable item tops
 * up a partial stack already in the pouch before opening a new one; anything
 * else takes the pouch's first free slot. Returns null when there is no pouch
 * in the tree (or the incoming subtree would nest too deep), which callers
 * treat as "fall back to normal backpack placement".
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
  const containers = backpackContainers(catalog, carried);
  if (!containers) return null;
  const carriedById = new Map(carried.map((entry) => [entry.id, entry]));
  const pouch = containers.find(
    (container) =>
      carriedById.get(container.containerId)?.typeId === ITEM_POUCH_TYPE_ID,
  );
  if (!pouch) return null;
  const height = subtreeHeight(input.subtree, item.id);
  if (pouch.depth + 1 + height > MAX_CONTAINER_DEPTH) return null;

  if (catalog.require(item.typeId).stackable) {
    const mergeTarget = carried
      .filter(
        (candidate) =>
          candidate.location.kind === "container" &&
          candidate.location.containerId === pouch.containerId,
      )
      .sort((left, right) => slotOf(left) - slotOf(right))
      .find((candidate) => canMergeItems(catalog, item, candidate, item.count));
    if (mergeTarget) return { location: mergeTarget.location, mergeTarget };
  }

  for (let slot = 0; slot < pouch.capacity; slot++) {
    if (pouch.occupiedSlots.has(slot)) continue;
    return {
      location: { kind: "container", containerId: pouch.containerId, slot },
    };
  }
  return null;
}

function slotOf(item: Item): number {
  return item.location.kind === "container" ? item.location.slot : 0;
}
