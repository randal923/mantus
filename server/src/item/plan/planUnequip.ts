import type {
  EquipmentSlot,
  ItemContainerDestination,
} from "@tibia/protocol";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { ItemLocation } from "../ItemLocation";
import type { CarriedPlan } from "./CarriedPlan";
import { containerPlacementAllowed } from "./containerPlacementAllowed";
import { firstFreeContainerSlot } from "./firstFreeContainerSlot";

export function planUnequip(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly slot: EquipmentSlot;
  readonly destination?: ItemContainerDestination;
}): CarriedPlan | null {
  const { characterId, catalog, items, slot } = input;
  if (slot === "backpack") return null;
  const item = items.find((candidate) => candidate.id === input.itemId);
  if (!item || item.version !== input.expectedVersion) return null;
  if (
    item.location.kind !== "equipment" ||
    item.location.characterId !== characterId ||
    item.location.slot !== slot
  ) {
    return null;
  }
  const type = catalog.require(item.typeId);
  const transformedTypeId = type.transformDeEquipTo ?? item.typeId;
  if (!catalog.get(transformedTypeId)) return null;
  let destinationLocation: ItemLocation;
  if (input.destination) {
    const container = items.find(
      (candidate) => candidate.id === input.destination?.containerId,
    );
    if (
      !container ||
      container.version !== input.destination.containerRevision
    ) {
      return null;
    }
    const capacity = catalog.require(container.typeId).containerCapacity ?? 0;
    if (input.destination.slot >= capacity) return null;
    const itemsById = new Map(items.map((entry) => [entry.id, entry]));
    if (!containerPlacementAllowed(items, itemsById, item.id, container)) {
      return null;
    }
    const occupied = items.some(
      (candidate) =>
        (candidate.location.kind === "container" ||
          candidate.location.kind === "corpse") &&
        candidate.location.containerId === container.id &&
        candidate.location.slot === input.destination?.slot,
    );
    if (occupied) return null;
    destinationLocation = {
      kind: "container",
      containerId: container.id,
      slot: input.destination.slot,
    };
  } else {
    const backpack = items.find(
      (candidate) =>
        candidate.location.kind === "equipment" &&
        candidate.location.slot === "backpack",
    );
    if (
      !backpack ||
      (catalog.require(backpack.typeId).containerCapacity ?? 0) < 1
    ) {
      return null;
    }
    const destinationSlot = firstFreeContainerSlot(catalog, items, backpack);
    if (destinationSlot === null) return null;
    destinationLocation = {
      kind: "container",
      containerId: backpack.id,
      slot: destinationSlot,
    };
  }
  const after: Item = {
    ...item,
    typeId: transformedTypeId,
    location: destinationLocation,
    version: item.version + 1,
  };
  return {
    mutation: { before: item, after: [after] },
    persist: {
      characterId,
      rowOps: [
        { kind: "write", expectedVersion: item.version, item: after },
      ],
      audits: [
        {
          kind: "transfer",
          itemId: item.id,
          from: item.location,
          to: after.location,
          count: after.count,
        },
        ...(transformedTypeId !== item.typeId
          ? [
              {
                kind: "transform" as const,
                itemId: item.id,
                fromTypeId: item.typeId,
                toTypeId: transformedTypeId,
              },
            ]
          : []),
      ],
    },
  };
}
