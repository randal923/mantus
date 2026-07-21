import type { InventoryItem } from "@tibia/protocol";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { getPotionDefinition } from "../potion/getPotionDefinition";
import { getToolDefinition } from "./getToolDefinition";
import { toItemTooltip } from "./toItemTooltip";

export function projectItem(item: Item, catalog: ItemCatalog): InventoryItem {
  const type = catalog.require(item.typeId);
  const useKind =
    type.kind === "rune"
      ? "rune"
      : getPotionDefinition(type.id)
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
    ...(type.stowable &&
    type.containerCapacity === undefined &&
    Object.keys(item.attributes).length === 0
      ? { stowable: true }
      : {}),
    tooltip: toItemTooltip(type),
  };
}
