import type { CarriedItemSummary } from "@tibia/protocol";
import { getPotionDefinition } from "../potion/getPotionDefinition";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { getItemUseKind } from "./getItemUseKind";

/** Protocol cap on `InventoryState.carried`; a character never nears it. */
const MAX_TYPES = 1_024;

/**
 * Totals every item type the character carries, Canary's
 * `Player::getInventoryItemsId`: equipment plus the contents of every
 * container, whether or not the player has it open. The action bar draws its
 * buttons from this, so a rune in a closed backpack keeps its icon and count.
 */
export function summarizeCarriedItems(
  items: ReadonlyArray<Item>,
  catalog: ItemCatalog,
): Array<CarriedItemSummary> {
  const byType = new Map<number, CarriedItemSummary>();
  for (const item of items) {
    const existing = byType.get(item.typeId);
    if (existing) {
      byType.set(item.typeId, {
        ...existing,
        count: existing.count + item.count,
      });
      continue;
    }
    if (byType.size >= MAX_TYPES) continue;
    const type = catalog.require(item.typeId);
    const useKind = getItemUseKind(type);
    const potion = getPotionDefinition(type.id);
    byType.set(item.typeId, {
      typeId: type.id,
      clientId: type.clientId,
      spriteId: type.spriteId,
      name: type.name,
      count: item.count,
      ...(type.equipmentSlot ? { equipmentSlot: type.equipmentSlot } : {}),
      ...(useKind ? { useKind } : {}),
      ...(potion
        ? {
            potionResources: [
              ...(potion.health ? (["health"] as const) : []),
              ...(potion.mana ? (["mana"] as const) : []),
            ],
          }
        : {}),
    });
  }
  return [...byType.values()].sort((left, right) => left.typeId - right.typeId);
}
