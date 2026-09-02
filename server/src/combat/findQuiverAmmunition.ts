import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemType } from "../item/ItemType";
import { isQuiverType } from "../item/isQuiverType";

/**
 * Canary `Player::getQuiverAmmoOfType`: the first stack of matching
 * ammunition inside the quiver dressing the shield hand, in container order.
 * Level requirements are the caller's check, like every other equipment read.
 */
export function findQuiverAmmunition(
  items: ReadonlyArray<Item>,
  catalog: ItemCatalog,
  ammoType: string,
): { item: Item; type: ItemType } | null {
  const quiver = items.find(
    (candidate) =>
      candidate.location.kind === "equipment" &&
      candidate.location.slot === "shield" &&
      isQuiverType(catalog.require(candidate.typeId)),
  );
  if (!quiver) return null;
  let found: { item: Item; type: ItemType; slot: number } | null = null;
  for (const candidate of items) {
    if (
      candidate.location.kind !== "container" ||
      candidate.location.containerId !== quiver.id
    ) {
      continue;
    }
    const type = catalog.require(candidate.typeId);
    if (type.weaponType !== "ammunition" || type.ammoType !== ammoType) {
      continue;
    }
    if (found === null || candidate.location.slot < found.slot) {
      found = { item: candidate, type, slot: candidate.location.slot };
    }
  }
  return found ? { item: found.item, type: found.type } : null;
}
