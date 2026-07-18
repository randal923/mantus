import type { EquipmentSlot } from "@tibia/protocol";
import type { Character } from "../../character/Character";
import type { CarriedPersistAudit, CarriedPersistRowOp } from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";
import { containerPlacementAllowed } from "./containerPlacementAllowed";
import { firstFreeInventorySlot } from "./firstFreeInventorySlot";

export function planEquip(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly level: number;
  readonly vocation: Character["vocation"];
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly slot: EquipmentSlot;
}): CarriedPlan | null {
  const { characterId, catalog, items, slot } = input;
  const item = items.find((candidate) => candidate.id === input.itemId);
  if (!item || item.version !== input.expectedVersion) return null;
  if (
    item.location.kind !== "inventory" &&
    item.location.kind !== "container"
  ) {
    return null;
  }
  const type = catalog.require(item.typeId);
  if (type.equipmentSlot !== slot) return null;
  if (
    type.requirements?.level !== undefined &&
    input.level < type.requirements.level
  ) {
    return null;
  }
  if (
    type.requirements?.vocations &&
    !type.requirements.vocations.includes(input.vocation)
  ) {
    return null;
  }
  const transformedTypeId = type.transformEquipTo ?? item.typeId;
  if (!catalog.get(transformedTypeId)) return null;
  if (type.slotType === "two-handed") {
    const shield = items.find(
      (candidate) =>
        candidate.location.kind === "equipment" &&
        candidate.location.slot === "shield" &&
        candidate.id !== item.id,
    );
    if (shield) return null;
  }
  if (slot === "shield") {
    const weapon = items.find(
      (candidate) =>
        candidate.location.kind === "equipment" &&
        candidate.location.slot === "weapon" &&
        candidate.id !== item.id,
    );
    if (weapon && catalog.require(weapon.typeId).slotType === "two-handed") {
      return null;
    }
  }
  const occupied = items.find(
    (candidate) =>
      candidate.location.kind === "equipment" &&
      candidate.location.slot === slot &&
      candidate.id !== item.id,
  );
  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  let displaced: Item | undefined;
  let displacedTypeId: number | undefined;
  if (occupied) {
    if (item.location.kind === "container") {
      const itemsById = new Map(items.map((entry) => [entry.id, entry]));
      const sourceContainer = itemsById.get(item.location.containerId);
      if (
        !sourceContainer ||
        !containerPlacementAllowed(
          items,
          itemsById,
          occupied.id,
          sourceContainer,
        )
      ) {
        return null;
      }
    }
    const occupiedType = catalog.require(occupied.typeId);
    displacedTypeId = occupiedType.transformDeEquipTo ?? occupied.typeId;
    if (!catalog.get(displacedTypeId)) return null;
    const temporarySlot = firstFreeInventorySlot(items);
    if (temporarySlot === null) return null;
    // The DB stages the displaced item on a free inventory slot so the
    // partial unique indexes never collide mid-transaction.
    rowOps.push({
      kind: "write",
      expectedVersion: occupied.version,
      item: {
        ...occupied,
        typeId: displacedTypeId,
        location: { kind: "inventory", characterId, slot: temporarySlot },
        version: occupied.version + 1,
      },
    });
    displaced = {
      ...occupied,
      typeId: displacedTypeId,
      location: item.location,
      version: occupied.version + 1,
    };
  }
  const after: Item = {
    ...item,
    typeId: transformedTypeId,
    location: { kind: "equipment", characterId, slot },
    version: item.version + 1,
  };
  rowOps.push({ kind: "write", expectedVersion: item.version, item: after });
  if (displaced) {
    rowOps.push({
      kind: "write",
      expectedVersion: displaced.version,
      item: displaced,
    });
  }
  audits.push({
    kind: "transfer",
    itemId: item.id,
    from: item.location,
    to: after.location,
    count: after.count,
  });
  if (occupied && displaced) {
    audits.push({
      kind: "transfer",
      itemId: occupied.id,
      from: occupied.location,
      to: displaced.location,
      count: displaced.count,
    });
  }
  if (transformedTypeId !== item.typeId) {
    audits.push({
      kind: "transform",
      itemId: item.id,
      fromTypeId: item.typeId,
      toTypeId: transformedTypeId,
    });
  }
  if (
    occupied &&
    displacedTypeId !== undefined &&
    displacedTypeId !== occupied.typeId
  ) {
    audits.push({
      kind: "transform",
      itemId: occupied.id,
      fromTypeId: occupied.typeId,
      toTypeId: displacedTypeId,
    });
  }
  return {
    mutation: {
      before: item,
      after: displaced ? [after, displaced] : [after],
    },
    persist: { characterId, rowOps, audits },
  };
}
