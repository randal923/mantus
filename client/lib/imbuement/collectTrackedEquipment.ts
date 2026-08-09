import {
  EQUIPMENT_SLOTS,
  type EquipmentSlot,
  type InventoryItem,
  type InventoryState,
} from "@tibia/protocol";
import { itemImbuementSlotCountOf } from "../forge/itemImbuementSlotCountOf";

export interface TrackedEquipment {
  readonly slot: EquipmentSlot;
  readonly item: InventoryItem;
  /** Total imbuement slots on the type; empty ones render as placeholders. */
  readonly slotCount: number;
  readonly imbuements: NonNullable<InventoryItem["imbuements"]>;
}

/**
 * The equipped pieces the imbuement tracker lists, in paper-doll order.
 *
 * Canary picks the rows server-side by walking every inventory slot and
 * keeping the items that have imbuement slots (game.cpp
 * `playerRequestInventoryImbuements`); OTClient then narrows that to a
 * hardcoded slot list. We keep Canary's rule and drop the hardcoded list,
 * because which of our item types carry slots is catalog data, not a fixed
 * set of six inventory positions.
 */
export function collectTrackedEquipment(
  inventory: InventoryState,
): ReadonlyArray<TrackedEquipment> {
  const tracked: TrackedEquipment[] = [];
  for (const slot of EQUIPMENT_SLOTS) {
    // The bound-items root is a storage container, not worn gear.
    if (slot === "bound") continue;
    const item = inventory.equipment[slot];
    if (!item) continue;
    const imbuements = item.imbuements ?? [];
    const slotCount = Math.max(itemImbuementSlotCountOf(item), imbuements.length);
    if (slotCount === 0) continue;
    tracked.push({ slot, item, slotCount, imbuements });
  }
  return tracked;
}
