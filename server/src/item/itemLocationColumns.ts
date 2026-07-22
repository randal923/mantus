import type { EquipmentSlot } from "@tibia/protocol";
import type { Item } from "./Item";

interface ItemLocationColumnValues {
  readonly locationType: string;
  readonly characterId: string | null;
  readonly containerId: string | null;
  readonly slotIndex: number | null;
  readonly equipmentSlot: EquipmentSlot | null;
  readonly depotId: number | null;
  readonly worldMapName: string | null;
  readonly worldX: number | null;
  readonly worldY: number | null;
  readonly worldZ: number | null;
  readonly worldStackIndex: number | null;
}

const EMPTY_COLUMNS = {
  characterId: null,
  containerId: null,
  slotIndex: null,
  equipmentSlot: null,
  depotId: null,
  worldMapName: null,
  worldX: null,
  worldY: null,
  worldZ: null,
  worldStackIndex: null,
};

/** Maps an item's location to the items-table column values that encode it. */
export function itemLocationColumns(
  item: Item,
  mapName?: string,
): ItemLocationColumnValues {
  const location = item.location;
  if (location.kind === "equipment") {
    return {
      ...EMPTY_COLUMNS,
      locationType: "equipment",
      characterId: location.characterId,
      equipmentSlot: location.slot,
    };
  }
  if (location.kind === "depot") {
    return {
      ...EMPTY_COLUMNS,
      locationType: "depot",
      characterId: location.characterId,
      slotIndex: location.slot,
      depotId: location.depotId,
    };
  }
  if (
    location.kind === "inbox" ||
    location.kind === "trade-reservation" ||
    location.kind === "market-escrow"
  ) {
    return {
      ...EMPTY_COLUMNS,
      locationType: location.kind,
      characterId: location.characterId,
      slotIndex: location.slot,
    };
  }
  if (location.kind === "container" || location.kind === "corpse") {
    return {
      ...EMPTY_COLUMNS,
      locationType: location.kind,
      containerId: location.containerId,
      slotIndex: location.slot,
    };
  }
  if (location.kind === "world" && mapName !== undefined) {
    return {
      ...EMPTY_COLUMNS,
      locationType: "world",
      worldMapName: mapName,
      worldX: location.position.x,
      worldY: location.position.y,
      worldZ: location.position.z,
      worldStackIndex: location.stackIndex,
    };
  }
  throw new Error(
    `item ${item.id} has a location kind item persistence cannot encode`,
  );
}
