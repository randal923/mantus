import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { ItemLocation } from "../ItemLocation";
import { backpackContainers } from "./backpackContainers";
import { canMergeItems } from "./canMergeItems";
import { subtreeHeight } from "./subtreeHeight";

const MAX_CONTAINER_DEPTH = 8;

/**
 * Where an item the player did not aim anywhere lands: the equipped backpack
 * and every bag nested inside it, depth-first in slot order — the same fill
 * order the DB-side `BackpackSlotLocker` produces, so a memory-first move
 * places a row exactly where the transactional path would have.
 *
 * A stackable item tops up the first partial stack it finds anywhere in that
 * tree before opening a new one; otherwise it takes the first free slot in the
 * first container with room. Returns null when the whole tree is full, which
 * the callers surface as "no room" rather than dropping the item.
 */
export function planBackpackPlacement(input: {
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

  const childrenByContainer = new Map<string, Item[]>();
  for (const candidate of carried) {
    if (candidate.location.kind !== "container") continue;
    const siblings =
      childrenByContainer.get(candidate.location.containerId) ?? [];
    siblings.push(candidate);
    childrenByContainer.set(candidate.location.containerId, siblings);
  }

  if (catalog.require(item.typeId).stackable) {
    for (const container of containers) {
      const mergeTarget = [
        ...(childrenByContainer.get(container.containerId) ?? []),
      ]
        .sort((left, right) => slotOf(left) - slotOf(right))
        .find((candidate) =>
          canMergeItems(catalog, item, candidate, item.count),
        );
      if (mergeTarget) return { location: mergeTarget.location, mergeTarget };
    }
  }

  const height = subtreeHeight(input.subtree, item.id);
  for (const container of containers) {
    // The same nesting rule the explicit-destination branch enforces: the
    // chain from the equipped backpack down, plus the incoming subtree, may
    // not exceed 8 levels. A deep bag simply gets skipped for a bulky item.
    if (container.depth + 1 + height > MAX_CONTAINER_DEPTH) continue;
    for (let slot = 0; slot < container.capacity; slot++) {
      if (container.occupiedSlots.has(slot)) continue;
      return {
        location: {
          kind: "container",
          containerId: container.containerId,
          slot,
        },
      };
    }
  }
  return null;
}

function slotOf(item: Item): number {
  return item.location.kind === "container" ? item.location.slot : 0;
}
