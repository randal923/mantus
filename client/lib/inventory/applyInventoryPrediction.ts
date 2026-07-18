import type {
  InventoryItem,
  InventorySlotEntry,
  InventoryState,
} from "@tibia/protocol";
import { findInventoryItem } from "./findInventoryItem";
import type { InventoryPrediction } from "./InventoryPrediction";

interface OptimisticInventoryItem extends InventoryItem {
  readonly optimistic: true;
}

function withoutItem(
  inventory: InventoryState,
  itemId: string,
): InventoryState {
  const equipment = { ...inventory.equipment };
  for (const slot of Object.keys(equipment) as Array<
    keyof InventoryState["equipment"]
  >) {
    if (equipment[slot]?.id === itemId) delete equipment[slot];
  }
  return {
    ...inventory,
    equipment,
    items: inventory.items.filter((entry) => entry.item.id !== itemId),
    containers: inventory.containers?.map((container) => ({
      ...container,
      items: container.items.filter((entry) => entry.item.id !== itemId),
    })),
  };
}

function withoutContainerSections(
  inventory: InventoryState,
  rootItemId: string,
): InventoryState {
  const containers = inventory.containers ?? [];
  const removed = new Set([rootItemId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const container of containers) {
      if (
        !removed.has(container.container.id) &&
        container.parentContainerId !== null &&
        removed.has(container.parentContainerId)
      ) {
        removed.add(container.container.id);
        changed = true;
      }
    }
  }
  return {
    ...inventory,
    containers: containers.filter(
      (container) => !removed.has(container.container.id),
    ),
  };
}

function withCount(
  inventory: InventoryState,
  itemId: string,
  count: number,
): InventoryState {
  const update = (entry: InventorySlotEntry): InventorySlotEntry => {
    if (entry.item.id !== itemId) return entry;
    const item: OptimisticInventoryItem = {
      ...entry.item,
      count,
      optimistic: true,
    };
    return { ...entry, item };
  };
  return {
    ...inventory,
    items: inventory.items.map(update),
    containers: inventory.containers?.map((container) => ({
      ...container,
      items: container.items.map(update),
    })),
  };
}

function freeBackpackSlots(inventory: InventoryState): number[] {
  if (!inventory.equipment.backpack) return [];
  const occupied = new Set(inventory.items.map((entry) => entry.slot));
  return Array.from({ length: inventory.slotCount }, (_, slot) => slot).filter(
    (slot) => !occupied.has(slot),
  );
}

function withBackpackItem(
  inventory: InventoryState,
  slot: number,
  item: OptimisticInventoryItem,
): InventoryState {
  const entry = { slot, item };
  const backpackId = inventory.equipment.backpack?.id;
  return {
    ...inventory,
    items: [...inventory.items, entry],
    containers: inventory.containers?.map((container) =>
      container.container.id === backpackId
        ? { ...container, items: [...container.items, entry] }
        : container,
    ),
  };
}

export function applyInventoryPrediction(
  inventory: InventoryState,
  prediction: InventoryPrediction,
): InventoryState | null {
  if (prediction.kind === "remove") {
    const item = findInventoryItem(inventory, prediction.itemId);
    if (!item || prediction.count < 1 || prediction.count > item.count) {
      return null;
    }
    if (prediction.count < item.count) {
      return withCount(
        inventory,
        item.id,
        item.count - prediction.count,
      );
    }
    return withoutContainerSections(
      withoutItem(inventory, item.id),
      item.id,
    );
  }

  if (
    prediction.count < 1 ||
    prediction.count > 100 ||
    prediction.itemIds.length === 0
  ) {
    return null;
  }
  if (prediction.item.stackable) {
    let projected = inventory;
    let remaining = prediction.count;
    for (const { item } of inventory.items) {
      if (item.typeId !== prediction.item.typeId || remaining === 0) continue;
      const added = Math.min(
        prediction.item.maxCount - item.count,
        remaining,
      );
      if (added <= 0) continue;
      projected = withCount(projected, item.id, item.count + added);
      remaining -= added;
    }
    if (remaining === 0) return projected;
    const stacks = Math.ceil(remaining / prediction.item.maxCount);
    const slots = freeBackpackSlots(projected).slice(0, stacks);
    if (slots.length !== stacks || prediction.itemIds.length < stacks) {
      return null;
    }
    return slots.reduce((state, slot, index) => {
      const count = Math.min(
        prediction.item.maxCount,
        remaining - index * prediction.item.maxCount,
      );
      return withBackpackItem(state, slot, {
        ...prediction.item,
        id: prediction.itemIds[index]!,
        count,
        revision: 1,
        optimistic: true,
      });
    }, projected);
  }

  const slots = freeBackpackSlots(inventory).slice(0, prediction.count);
  if (
    slots.length !== prediction.count ||
    prediction.itemIds.length < prediction.count
  ) {
    return null;
  }
  return slots.reduce(
    (state, slot, index) =>
      withBackpackItem(state, slot, {
        ...prediction.item,
        id: prediction.itemIds[index]!,
        count: 1,
        revision: 1,
        optimistic: true,
      }),
    inventory,
  );
}
