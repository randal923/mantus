import {
  DEPOT_LIMITS,
  EQUIPMENT_SLOTS,
  type CarriedDepotItem,
} from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { projectItem } from "../item/projectItem";

/**
 * Every carried item the depot window can act on, walked depth-first from the
 * equipped containers so the contents of closed backpacks are listed right
 * below their bag. Mirrors what the deposit/stow plans accept: any item whose
 * location is a container, at any nesting depth.
 */
export function listCarriedDepotItems(
  items: ReadonlyArray<Item>,
  catalog: ItemCatalog,
): CarriedDepotItem[] {
  const byContainer = new Map<string, Item[]>();
  for (const item of items) {
    if (item.location.kind !== "container") continue;
    const siblings = byContainer.get(item.location.containerId) ?? [];
    siblings.push(item);
    byContainer.set(item.location.containerId, siblings);
  }
  for (const siblings of byContainer.values()) {
    siblings.sort((left, right) => {
      const leftSlot =
        left.location.kind === "container" ? left.location.slot : 0;
      const rightSlot =
        right.location.kind === "container" ? right.location.slot : 0;
      return leftSlot - rightSlot;
    });
  }
  const listed: CarriedDepotItem[] = [];
  const visited = new Set<string>();
  const walk = (containerId: string, depth: number): void => {
    if (depth > DEPOT_LIMITS.maxCarriedDepth || visited.has(containerId)) {
      return;
    }
    visited.add(containerId);
    for (const item of byContainer.get(containerId) ?? []) {
      if (listed.length >= DEPOT_LIMITS.maxCarriedListed) return;
      listed.push({ depth, item: projectItem(item, catalog) });
      if (catalog.require(item.typeId).containerCapacity !== undefined) {
        walk(item.id, depth + 1);
      }
    }
  };
  for (const slot of EQUIPMENT_SLOTS) {
    const equipped = items.find(
      (item) =>
        item.location.kind === "equipment" && item.location.slot === slot,
    );
    if (!equipped) continue;
    if (catalog.require(equipped.typeId).containerCapacity === undefined) {
      continue;
    }
    walk(equipped.id, 0);
  }
  return listed;
}
