import type {
  InventoryItem,
  InventorySlotEntry,
  InventoryState,
} from "@tibia/protocol";
import { findInventoryItem } from "./findInventoryItem";
import type { PendingItemOp } from "./PendingItemOp";

const MAX_PREDICTED_STACK = 100;

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
      if (removed.has(container.container.id)) continue;
      if (
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

function isContainerVisible(
  inventory: InventoryState,
  containerId: string,
): boolean {
  if (inventory.equipment.backpack?.id === containerId) return true;
  return (inventory.containers ?? []).some(
    (container) => container.container.id === containerId,
  );
}

function slotOccupant(
  inventory: InventoryState,
  containerId: string,
  slot: number,
): InventoryItem | undefined {
  if (inventory.equipment.backpack?.id === containerId) {
    const entry = inventory.items.find((candidate) => candidate.slot === slot);
    if (entry) return entry.item;
  }
  return (inventory.containers ?? [])
    .find((container) => container.container.id === containerId)
    ?.items.find((candidate) => candidate.slot === slot)?.item;
}

function withEntry(
  inventory: InventoryState,
  containerId: string,
  slot: number,
  item: InventoryItem,
): InventoryState {
  const entry: InventorySlotEntry = { slot, item };
  const isBackpack = inventory.equipment.backpack?.id === containerId;
  return {
    ...inventory,
    items: isBackpack ? [...inventory.items, entry] : inventory.items,
    containers: inventory.containers?.map((container) =>
      container.container.id === containerId
        ? { ...container, items: [...container.items, entry] }
        : container,
    ),
  };
}

function withCount(
  inventory: InventoryState,
  itemId: string,
  count: number,
): InventoryState {
  const update = (entry: InventorySlotEntry): InventorySlotEntry =>
    entry.item.id === itemId
      ? { ...entry, item: { ...entry.item, count } }
      : entry;
  return {
    ...inventory,
    items: inventory.items.map(update),
    containers: inventory.containers?.map((container) => ({
      ...container,
      items: container.items.map(update),
    })),
  };
}

function firstFreeBackpackSlot(
  inventory: InventoryState,
): { containerId: string; slot: number } | null {
  const backpackId = inventory.equipment.backpack?.id;
  if (!backpackId) return null;
  const occupied = new Set(inventory.items.map((entry) => entry.slot));
  for (let slot = 0; slot < inventory.slotCount; slot += 1) {
    if (!occupied.has(slot)) return { containerId: backpackId, slot };
  }
  return null;
}

/**
 * Predicts the inventory projection after an op, for optimistic rendering
 * only — the server outcome always replaces it. Returns null when the
 * outcome is not confidently predictable (occupied slots that swap, backpack
 * re-equips, hidden destinations); callers then render the unmodified state.
 */
export function applyPendingItemOp(
  inventory: InventoryState,
  op: PendingItemOp,
): InventoryState | null {
  if (op.kind === "pickup" || op.kind === "move-map") return null;
  const item = findInventoryItem(inventory, op.itemId);
  if (!item) return null;
  if (op.kind === "drop") {
    return withoutContainerSections(withoutItem(inventory, item.id), item.id);
  }
  if (op.kind === "equip") {
    if (op.slot === "backpack") return null;
    if (item.equipmentSlot !== op.slot) return null;
    if (inventory.equipment[op.slot]) return null;
    const removed = withoutItem(inventory, item.id);
    return {
      ...removed,
      equipment: { ...removed.equipment, [op.slot]: item },
    };
  }
  if (op.kind === "unequip") {
    if (op.slot === "backpack") return null;
    if (inventory.equipment[op.slot]?.id !== item.id) return null;
    const destination = op.destination ?? firstFreeBackpackSlot(inventory);
    if (!destination) return null;
    if (!isContainerVisible(inventory, destination.containerId)) return null;
    if (slotOccupant(inventory, destination.containerId, destination.slot)) {
      return null;
    }
    const removed = withoutItem(inventory, item.id);
    return withEntry(removed, destination.containerId, destination.slot, item);
  }
  if (item.id === op.destinationContainerId) return null;
  if (!isContainerVisible(inventory, op.destinationContainerId)) return null;
  const occupant = slotOccupant(
    inventory,
    op.destinationContainerId,
    op.destinationSlot,
  );
  if (occupant) {
    if (occupant.id === item.id) return null;
    if (occupant.typeId !== item.typeId) return null;
    if (item.count + occupant.count > MAX_PREDICTED_STACK) return null;
    if (item.count <= 1 && occupant.count <= 1) return null;
    return withCount(
      withoutItem(inventory, item.id),
      occupant.id,
      occupant.count + item.count,
    );
  }
  const removed = withoutItem(inventory, item.id);
  return withEntry(
    removed,
    op.destinationContainerId,
    op.destinationSlot,
    item,
  );
}
