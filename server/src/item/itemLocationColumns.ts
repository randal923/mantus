import type { EquipmentSlot } from "@tibia/protocol";
import type { Item } from "./Item";

interface ItemLocationColumnValues {
  readonly locationType: string;
  readonly characterId: string | null;
  readonly containerId: string | null;
  readonly slotIndex: number | null;
  readonly equipmentSlot: EquipmentSlot | null;
  readonly depotId: number | null;
}

/** Maps an item's location to the items-table column values that encode it. */
export function itemLocationColumns(item: Item): ItemLocationColumnValues {
  const location = item.location;
  if (location.kind === "equipment") {
    return {
      locationType: "equipment",
      characterId: location.characterId,
      containerId: null,
      slotIndex: null,
      equipmentSlot: location.slot,
      depotId: null,
    };
  }
  if (location.kind === "depot") {
    return {
      locationType: "depot",
      characterId: location.characterId,
      containerId: null,
      slotIndex: location.slot,
      equipmentSlot: null,
      depotId: location.depotId,
    };
  }
  if (
    location.kind === "inventory" ||
    location.kind === "inbox" ||
    location.kind === "trade-reservation" ||
    location.kind === "market-escrow"
  ) {
    return {
      locationType: location.kind,
      characterId: location.characterId,
      containerId: null,
      slotIndex: location.slot,
      equipmentSlot: null,
      depotId: null,
    };
  }
  if (location.kind === "container" || location.kind === "corpse") {
    return {
      locationType: location.kind,
      characterId: null,
      containerId: location.containerId,
      slotIndex: location.slot,
      equipmentSlot: null,
      depotId: null,
    };
  }
  throw new Error(
    `item ${item.id} has a location kind depot persistence cannot encode`,
  );
}
