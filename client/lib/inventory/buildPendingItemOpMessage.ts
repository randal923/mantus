import type { InventoryState } from "@tibia/protocol";
import { findInventoryItem } from "./findInventoryItem";
import type { PendingItemOp, PendingItemOpIntent } from "./PendingItemOp";

/**
 * Builds the wire intent for a queued op against the latest server-confirmed
 * inventory, so revisions are always fresh when the op is finally sent.
 * Returns null when the op no longer applies (item or destination gone).
 */
export function buildPendingItemOpMessage(
  op: PendingItemOp,
  inventory: InventoryState,
): PendingItemOpIntent | null {
  if (op.kind === "move-map") {
    return {
      type: "move-map-item",
      itemId: op.itemId,
      revision: op.revision,
      fromPosition: op.fromPosition,
      toPosition: op.toPosition,
    };
  }
  if (op.kind === "pickup") {
    if (!op.destination) {
      return {
        type: "pickup-item",
        itemId: op.itemId,
        revision: op.revision,
        position: op.position,
        ...(op.equipSlot ? { equipSlot: op.equipSlot } : {}),
      };
    }
    const container = findInventoryItem(inventory, op.destination.containerId);
    if (!container) return null;
    return {
      type: "pickup-item",
      itemId: op.itemId,
      revision: op.revision,
      position: op.position,
      destination: {
        containerId: container.id,
        containerRevision: container.revision,
        slot: op.destination.slot,
        ...(op.destination.placement
          ? { placement: op.destination.placement }
          : {}),
      },
    };
  }
  const item = findInventoryItem(inventory, op.itemId);
  if (!item) return null;
  switch (op.kind) {
    case "move": {
      const destination = findInventoryItem(
        inventory,
        op.destinationContainerId,
      );
      if (!destination) return null;
      return {
        type: "move-item",
        itemId: item.id,
        revision: item.revision,
        destinationContainerId: destination.id,
        destinationRevision: destination.revision,
        destinationSlot: op.destinationSlot,
        ...(op.destinationPlacement
          ? { destinationPlacement: op.destinationPlacement }
          : {}),
      };
    }
    case "equip":
      if (item.equipmentSlot !== op.slot) return null;
      return {
        type: "equip-item",
        itemId: item.id,
        revision: item.revision,
        slot: op.slot,
      };
    case "unequip": {
      if (op.slot === "backpack") return null;
      if (!op.destination) {
        return {
          type: "unequip-item",
          itemId: item.id,
          revision: item.revision,
          slot: op.slot,
        };
      }
      const container = findInventoryItem(inventory, op.destination.containerId);
      if (!container) return null;
      return {
        type: "unequip-item",
        itemId: item.id,
        revision: item.revision,
        slot: op.slot,
        destination: {
          containerId: container.id,
          containerRevision: container.revision,
          slot: op.destination.slot,
          ...(op.destination.placement
            ? { placement: op.destination.placement }
            : {}),
        },
      };
    }
    case "drop":
      return {
        type: "drop-item",
        itemId: item.id,
        revision: item.revision,
        position: op.position,
      };
  }
}
