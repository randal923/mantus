import type { InventoryItem } from "@tibia/protocol";
import { itemImbuementsOf } from "../forge/itemImbuementsOf";
import { itemTierOf } from "../forge/itemTierOf";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { getPotionDefinition } from "../potion/getPotionDefinition";
import { getItemUseKind } from "./getItemUseKind";
import { toItemTooltip } from "./toItemTooltip";

export function projectItem(item: Item, catalog: ItemCatalog): InventoryItem {
  const type = catalog.require(item.typeId);
  const potion = getPotionDefinition(type.id);
  const useKind = getItemUseKind(type);
  // Running imbuements, so equipped gear can show its icons and time left
  // without a shrine. Entries written before the icon was denormalized fall
  // back to the placeholder rather than dropping the badge.
  const imbuements = itemImbuementsOf(item).map((entry) => ({
    slot: entry.slot,
    name: entry.name ?? "imbuement",
    iconId: entry.iconId ?? 0,
    remainingSeconds: entry.remainingSeconds,
  }));
  return {
    id: item.id,
    typeId: type.id,
    clientId: type.clientId,
    spriteId: type.spriteId,
    name: type.name,
    stackable: type.stackable,
    maxCount: type.maxCount,
    count: item.count,
    revision: item.version,
    ...(type.equipmentSlot ? { equipmentSlot: type.equipmentSlot } : {}),
    ...(type.slotType === "two-handed" ? { twoHanded: true } : {}),
    ...(type.containerCapacity !== undefined
      ? { containerCapacity: type.containerCapacity }
      : {}),
    ...(useKind ? { useKind } : {}),
    ...(potion
      ? {
          potionResources: [
            ...(potion.health ? (["health"] as const) : []),
            ...(potion.mana ? (["mana"] as const) : []),
          ],
        }
      : {}),
    ...(type.stowable &&
    type.containerCapacity === undefined &&
    Object.keys(item.attributes).length === 0
      ? { stowable: true }
      : {}),
    ...(itemTierOf(item) > 0 ? { tier: itemTierOf(item) } : {}),
    ...(imbuements.length > 0 ? { imbuements } : {}),
    tooltip: toItemTooltip(type, item),
  };
}
