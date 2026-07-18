import type {
  InventoryState,
  OwnCharacterState,
  Position,
} from "@tibia/protocol";
import { exceedsCapacity } from "./exceedsCapacity";
import { findInventoryItem } from "./findInventoryItem";
import type { PendingItemOp } from "./PendingItemOp";

/** Mirrors the server's THROW_RANGE in validateItemIntentTarget. */
const THROW_RANGE = 7;

export type ItemOpRejection =
  | "wrong-slot"
  | "level-too-low"
  | "wrong-vocation"
  | "two-handed-conflict"
  | "shield-conflict"
  | "invalid-destination"
  | "out-of-range"
  | "too-far"
  | "too-heavy";

function isNear(left: Position, right: Position): boolean {
  return (
    left.z === right.z &&
    Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= 1
  );
}

function containerCapacity(
  inventory: InventoryState,
  containerId: string,
): number | null {
  if (inventory.equipment.backpack?.id === containerId) {
    return inventory.slotCount;
  }
  const section = (inventory.containers ?? []).find(
    (container) => container.container.id === containerId,
  );
  return section ? section.capacity : null;
}

function isWithinItem(
  inventory: InventoryState,
  containerId: string,
  itemId: string,
): boolean {
  const containers = inventory.containers ?? [];
  const visited = new Set<string>();
  let current: string | null = containerId;
  while (current && !visited.has(current)) {
    if (current === itemId) return true;
    visited.add(current);
    current =
      containers.find((container) => container.container.id === current)
        ?.parentContainerId ?? null;
  }
  return false;
}

function slotOccupied(
  inventory: InventoryState,
  containerId: string,
  slot: number,
): boolean {
  if (inventory.equipment.backpack?.id === containerId) {
    if (inventory.items.some((entry) => entry.slot === slot)) return true;
  }
  return (inventory.containers ?? []).some(
    (container) =>
      container.container.id === containerId &&
      container.items.some((entry) => entry.slot === slot),
  );
}

/**
 * Client-side pre-check run before an op is queued and sent. Only rejects
 * ops the server would certainly reject (equip requirements, impossible
 * destinations, out-of-range map targets); anything uncertain — swaps,
 * merges, state the client cannot see — passes through so the server stays
 * the authority. Returns null when the op may be sent.
 */
export function validateItemOp(
  op: PendingItemOp,
  inventory: InventoryState,
  character: Pick<OwnCharacterState, "level" | "vocation" | "position">,
): ItemOpRejection | null {
  if (op.kind === "equip") {
    const item = findInventoryItem(inventory, op.itemId);
    if (!item) return null;
    if (item.equipmentSlot !== op.slot) return "wrong-slot";
    if (
      item.tooltip.requiredLevel !== undefined &&
      character.level < item.tooltip.requiredLevel
    ) {
      return "level-too-low";
    }
    if (
      item.tooltip.vocations &&
      !item.tooltip.vocations.includes(character.vocation)
    ) {
      return "wrong-vocation";
    }
    if (item.twoHanded && inventory.equipment.shield) {
      return "two-handed-conflict";
    }
    if (op.slot === "shield" && inventory.equipment.weapon?.twoHanded) {
      return "shield-conflict";
    }
    return null;
  }
  if (op.kind === "unequip") {
    if (!op.destination) return null;
    const capacity = containerCapacity(inventory, op.destination.containerId);
    if (capacity === null) return null;
    if (op.destination.slot >= capacity) return "invalid-destination";
    if (isWithinItem(inventory, op.destination.containerId, op.itemId)) {
      return "invalid-destination";
    }
    if (
      slotOccupied(inventory, op.destination.containerId, op.destination.slot)
    ) {
      return "invalid-destination";
    }
    return null;
  }
  if (op.kind === "move") {
    if (!findInventoryItem(inventory, op.itemId)) return null;
    const capacity = containerCapacity(inventory, op.destinationContainerId);
    if (capacity === null) return null;
    if (op.destinationSlot >= capacity) return "invalid-destination";
    if (isWithinItem(inventory, op.destinationContainerId, op.itemId)) {
      return "invalid-destination";
    }
    return null;
  }
  if (op.kind === "drop") {
    return isNear(character.position, op.position) ? null : "out-of-range";
  }
  if (op.kind === "pickup") {
    if (!isNear(character.position, op.position)) return "out-of-range";
    if (op.weight !== undefined && exceedsCapacity(inventory, op.weight)) {
      return "too-heavy";
    }
    if (op.destination) {
      const capacity = containerCapacity(inventory, op.destination.containerId);
      if (capacity !== null && op.destination.slot >= capacity) {
        return "invalid-destination";
      }
    }
    return null;
  }
  if (!isNear(character.position, op.fromPosition)) return "out-of-range";
  if (
    op.toPosition.z !== character.position.z ||
    Math.max(
      Math.abs(op.toPosition.x - character.position.x),
      Math.abs(op.toPosition.y - character.position.y),
    ) > THROW_RANGE
  ) {
    return "too-far";
  }
  return null;
}
