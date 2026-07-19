import type { ItemContainerDestination } from "@tibia/protocol";
import { carriedWeight } from "../../depot/carriedWeight";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { ItemLocation } from "../ItemLocation";
import { appendUnpersistedLootInserts } from "./appendUnpersistedLootInserts";
import { canMergeItems } from "./canMergeItems";
import type { CarriedPlan } from "./CarriedPlan";
import { containerAncestryChain } from "./containerAncestryChain";
import { firstFreeContainerSlot } from "./firstFreeContainerSlot";
import { subtreeHeight } from "./subtreeHeight";
import type { WorldItemsView } from "./WorldItemsView";

const MAX_CARRIED_ITEMS = 500;

/**
 * Takes one direct child of a world container (corpse) into the carried
 * inventory. Ownership protection, reach, and the open view are re-checked by
 * the caller at execution time; this plans the atomic move itself.
 */
export function planLoot(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: {
    readonly items: ReadonlyArray<Item>;
    readonly capacityMax: number;
  };
  readonly world: WorldItemsView;
  readonly containerId: string;
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly destination?: ItemContainerDestination;
}): CarriedPlan | null {
  const { characterId, catalog, carried, world } = input;
  const root = world.getWorldItem(input.containerId);
  if (!root || root.location.kind !== "world") return null;
  const owner = root.attributes.ownerCharacterId;
  if (typeof owner === "string" && owner !== characterId) return null;
  const item = world.getWorldItem(input.itemId);
  if (
    !item ||
    (item.location.kind !== "corpse" && item.location.kind !== "container") ||
    item.location.containerId !== root.id ||
    item.version !== input.expectedVersion
  ) {
    return null;
  }
  const type = catalog.require(item.typeId);
  if (!type.pickupable || !type.movable) return null;
  const subtree = world.getWorldSubtree(item.id);
  const children = subtree.slice(1);
  if (carried.items.length + subtree.length > MAX_CARRIED_ITEMS) return null;
  if (
    carriedWeight(catalog, carried.items) + carriedWeight(catalog, subtree) >
    carried.capacityMax * 100
  ) {
    return null;
  }

  const carriedById = new Map(carried.items.map((entry) => [entry.id, entry]));
  let finalLocation: ItemLocation;
  let mergeTarget: Item | undefined;

  if (input.destination) {
    const container = carriedById.get(input.destination.containerId);
    if (
      !container ||
      container.version !== input.destination.containerRevision
    ) {
      return null;
    }
    const capacity = catalog.require(container.typeId).containerCapacity ?? 0;
    if (input.destination.slot >= capacity) return null;
    const ancestry = containerAncestryChain(carriedById, container);
    if (ancestry.length + subtreeHeight(subtree, item.id) > 8) return null;
    const occupant = carried.items.find(
      (candidate) =>
        (candidate.location.kind === "container" ||
          candidate.location.kind === "corpse") &&
        candidate.location.containerId === container.id &&
        candidate.location.slot === input.destination?.slot,
    );
    if (occupant) {
      if (!canMergeItems(catalog, item, occupant, item.count)) return null;
      mergeTarget = occupant;
    }
    finalLocation = {
      kind: "container",
      containerId: container.id,
      slot: input.destination.slot,
    };
  } else {
    const backpack = carried.items.find(
      (entry) =>
        entry.location.kind === "equipment" &&
        entry.location.slot === "backpack",
    );
    if (
      !backpack ||
      (catalog.require(backpack.typeId).containerCapacity ?? 0) < 1
    ) {
      return null;
    }
    mergeTarget = type.stackable
      ? carried.items
          .filter(
            (candidate) =>
              candidate.location.kind === "container" &&
              candidate.location.containerId === backpack.id,
          )
          .sort((left, right) => slotOf(left) - slotOf(right))
          .find((candidate) =>
            canMergeItems(catalog, item, candidate, item.count),
          )
      : undefined;
    if (mergeTarget) {
      finalLocation = mergeTarget.location;
    } else {
      const slot = firstFreeContainerSlot(catalog, carried.items, backpack);
      if (slot === null) return null;
      finalLocation = { kind: "container", containerId: backpack.id, slot };
    }
  }

  const final: Item = {
    ...item,
    count: item.count + (mergeTarget?.count ?? 0),
    location: finalLocation,
    version: item.version + 1,
  };
  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  const removedItemIds: string[] = [];
  if (mergeTarget) {
    rowOps.push({
      kind: "delete",
      itemId: mergeTarget.id,
      expectedVersion: mergeTarget.version,
    });
    removedItemIds.push(mergeTarget.id);
    audits.push({
      kind: "merge",
      survivorItemId: item.id,
      sourceItemId: mergeTarget.id,
      movedCount: mergeTarget.count,
      sourceRemaining: 0,
      resultCount: final.count,
    });
  }
  const origin = world.lootOrigin(item.id);
  if (origin) {
    rowOps.push({ kind: "insert", item: final });
    audits.push({
      kind: "loot-created",
      itemId: item.id,
      eventId: origin.eventId,
      killerCharacterId: origin.killerCharacterId,
      typeId: item.typeId,
      count: item.count,
    });
  } else {
    rowOps.push({ kind: "write", expectedVersion: item.version, item: final });
  }
  appendUnpersistedLootInserts(world, children, rowOps, audits);
  audits.push({
    kind: "transfer",
    itemId: item.id,
    from: item.location,
    to: final.location,
    count: final.count,
  });
  return {
    mutation: {
      before: item,
      after: [final, ...children],
      ...(removedItemIds.length > 0 ? { removedItemIds } : {}),
    },
    persist: { characterId, rowOps, audits },
  };
}

function slotOf(item: Item): number {
  return item.location.kind === "container" ||
    item.location.kind === "corpse" ||
    item.location.kind === "inventory"
    ? item.location.slot
    : 0;
}
