import {
  EQUIPMENT_SLOTS,
  type EquipmentSlot,
  type InventoryItem,
  type InventoryState,
} from "@tibia/protocol";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { toItemTooltip } from "./toItemTooltip";

function projectItem(item: Item, catalog: ItemCatalog): InventoryItem {
  const type = catalog.require(item.typeId);
  const useKind =
    type.kind === "rune"
      ? "rune"
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
    count: item.count,
    revision: item.version,
    ...(type.equipmentSlot ? { equipmentSlot: type.equipmentSlot } : {}),
    ...(type.containerCapacity !== undefined
      ? { containerCapacity: type.containerCapacity }
      : {}),
    ...(useKind ? { useKind } : {}),
    tooltip: toItemTooltip(type),
  };
}

export function projectInventory(
  items: ReadonlyArray<Item>,
  catalog: ItemCatalog,
  capacityMax: number,
  revision: number,
  openContainerIds: ReadonlySet<string> = new Set(),
): InventoryState {
  const equipment: Partial<Record<EquipmentSlot, InventoryItem>> = {};
  for (const slot of EQUIPMENT_SLOTS) {
    const item = items.find(
      (candidate) =>
        candidate.location.kind === "equipment" &&
        candidate.location.slot === slot,
    );
    if (item) equipment[slot] = projectItem(item, catalog);
  }
  const backpack = items.find(
    (item) =>
      item.location.kind === "equipment" && item.location.slot === "backpack",
  );
  const contents = items
    .filter(
      (item) =>
        (item.location.kind === "container" &&
          item.location.containerId === backpack?.id) ||
        item.location.kind === "inventory",
    )
    .sort((left, right) => {
      const leftSlot =
        left.location.kind === "container" ||
        left.location.kind === "inventory"
          ? left.location.slot
          : 0;
      const rightSlot =
        right.location.kind === "container" ||
        right.location.kind === "inventory"
          ? right.location.slot
          : 0;
      return leftSlot - rightSlot;
    });
  const countCurrency = (typeId: number) =>
    items
      .filter((item) => item.typeId === typeId)
      .reduce((total, item) => total + item.count, 0);
  const usedWeight = items.reduce(
    (total, item) => total + catalog.require(item.typeId).weight * item.count,
    0,
  );
  const containers = [...openContainerIds].flatMap((containerId) => {
    const container = items.find((item) => item.id === containerId);
    if (!container) return [];
    const capacity =
      catalog.require(container.typeId).containerCapacity;
    if (capacity === undefined) return [];
    const containerItems = items
      .filter(
        (item) =>
          (item.location.kind === "container" ||
            item.location.kind === "corpse") &&
          item.location.containerId === container.id,
      )
      .sort((left, right) => {
        const leftSlot =
          left.location.kind === "container" ||
          left.location.kind === "corpse"
            ? left.location.slot
            : 0;
        const rightSlot =
          right.location.kind === "container" ||
          right.location.kind === "corpse"
            ? right.location.slot
            : 0;
        return leftSlot - rightSlot;
      })
      .map((item) => ({
        slot:
          item.location.kind === "container" ||
          item.location.kind === "corpse"
            ? item.location.slot
            : 0,
        item: projectItem(item, catalog),
      }));
    return [
      {
        container: projectItem(container, catalog),
        parentContainerId:
          container.location.kind === "container" ||
          container.location.kind === "corpse"
            ? container.location.containerId
            : null,
        capacity,
        items: containerItems,
      },
    ];
  });

  return {
    revision,
    equipment,
    items: contents.map((item) => ({
      slot:
        item.location.kind === "container" ||
        item.location.kind === "inventory"
          ? item.location.slot
          : 0,
      item: projectItem(item, catalog),
    })),
    gold: countCurrency(3031),
    platinum: countCurrency(3035),
    crystal: countCurrency(3043),
    capacityUsed: Math.ceil(usedWeight / 100),
    capacityMax,
    slotCount: backpack
      ? (catalog.require(backpack.typeId).containerCapacity ?? 0)
      : 0,
    containers,
  };
}
