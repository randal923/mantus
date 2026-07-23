import type { InventoryItem } from "@tibia/protocol";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { getPotionDefinition } from "../potion/getPotionDefinition";
import { getToolDefinition } from "./getToolDefinition";
import { toItemTooltip } from "./toItemTooltip";

export function projectItem(item: Item, catalog: ItemCatalog): InventoryItem {
  const type = catalog.require(item.typeId);
  const potion = getPotionDefinition(type.id);
  const useKind =
    type.kind === "rune"
      ? "rune"
      : potion
        ? "potion"
      : getToolDefinition(type.id)
        ? "useWith"
      : type.containerCapacity !== undefined
        ? "container"
        : type.food
          ? "food"
          : type.text?.readable
            ? "read"
            : type.rotateTo
              ? "rotate"
              : undefined;
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
    tooltip: toItemTooltip(type),
  };
}
