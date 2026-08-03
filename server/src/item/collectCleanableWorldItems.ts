import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";

interface CleanableWorld {
  worldItemRoots(): ReadonlyArray<Item>;
  isProtectionZone(position: { x: number; y: number; z: number }): boolean;
  getHouseId(position: { x: number; y: number; z: number }): number | undefined;
}

interface CleanableOptions {
  /** Canary's `cleanProtectionZones`: off, depot floors keep their clutter. */
  readonly cleanProtectionZones: boolean;
}

/**
 * The ground items a map clean removes, mirroring Canary's `Item::isCleanable`
 * — not loaded from the map, pickupable and movable, no unique or action id —
 * plus its tile rule: protection-zone tiles are spared unless the server opted
 * in (`cleanProtectionZones`).
 *
 * Map-seed items are excluded by their `seedKey`: they are the map's own
 * furniture, and a clean that ate them would strip the world permanently.
 * House tiles are excluded too — a house floor is the player's storage, not
 * clutter. Only roots are returned; whatever is inside them is destroyed with
 * them by the caller's mutation.
 */
export function collectCleanableWorldItems(
  world: CleanableWorld,
  catalog: ItemCatalog,
  options: CleanableOptions,
): Item[] {
  const cleanable: Item[] = [];
  for (const item of world.worldItemRoots()) {
    if (item.location.kind !== "world" || item.seedKey !== undefined) continue;
    if (item.attributes.uniqueId !== undefined) continue;
    if (item.attributes.actionId !== undefined) continue;
    const type = catalog.get(item.typeId);
    if (!type?.pickupable || !type.movable) continue;
    const { position } = item.location;
    if (world.getHouseId(position) !== undefined) continue;
    if (!options.cleanProtectionZones && world.isProtectionZone(position)) {
      continue;
    }
    cleanable.push(item);
  }
  return cleanable;
}
