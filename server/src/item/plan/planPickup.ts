import type { ItemContainerDestination, Position } from "@tibia/protocol";
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
import { firstFreeInventorySlot } from "./firstFreeInventorySlot";
import { materializeWorldSource } from "./materializeWorldSource";
import { subtreeHeight } from "./subtreeHeight";
import type { WorldItemsView } from "./WorldItemsView";

const MAX_CARRIED_ITEMS = 500;

export function planPickup(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: {
    readonly items: ReadonlyArray<Item>;
    readonly capacityMax: number;
  };
  readonly world: WorldItemsView;
  readonly itemInstanceId: string;
  readonly expectedVersion: number;
  readonly position: Position;
  readonly destination?: ItemContainerDestination;
  readonly stageInInventory: boolean;
}): CarriedPlan | null {
  const { characterId, catalog, carried, world, position } = input;
  const mapItem = world
    .getMapItems(position)
    .find((candidate) => candidate.instanceId === input.itemInstanceId);
  if (!mapItem) return null;

  let root = world.getWorldItem(input.itemInstanceId);
  let children: ReadonlyArray<Item>;
  let pristine: ReturnType<typeof materializeWorldSource> = null;
  if (root) {
    const location = root.location;
    if (
      location.kind !== "world" ||
      location.position.x !== position.x ||
      location.position.y !== position.y ||
      location.position.z !== position.z
    ) {
      return null;
    }
    children = world.getWorldSubtree(root.id).slice(1);
  } else {
    const source = mapItem.source;
    if (!source || source.seedKey !== input.itemInstanceId) return null;
    pristine = materializeWorldSource(catalog, source);
    if (!pristine) return null;
    root = pristine.root;
    children = pristine.contents;
  }
  if (root.version !== input.expectedVersion) return null;
  const type = catalog.require(root.typeId);
  if (!type.pickupable || !type.movable) return null;
  const subtree = [root, ...children];
  if (carried.items.length + subtree.length > MAX_CARRIED_ITEMS) return null;
  if (
    carriedWeight(catalog, carried.items) + carriedWeight(catalog, subtree) >
    carried.capacityMax * 100
  ) {
    return null;
  }

  const carriedById = new Map(carried.items.map((item) => [item.id, item]));
  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  const removedItemIds: string[] = [];
  let finalLocation: ItemLocation;
  let mergeTarget: Item | undefined;

  if (input.stageInInventory) {
    const stagingSlot = firstFreeInventorySlot(carried.items);
    if (stagingSlot === null) return null;
    finalLocation = { kind: "inventory", characterId, slot: stagingSlot };
  } else if (input.destination) {
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
    if (
      ancestry.length + subtreeHeight(subtree, root.id) > 8 ||
      ancestry.some((ancestor) => ancestor.id === root.id)
    ) {
      return null;
    }
    const occupant = carried.items.find(
      (candidate) =>
        (candidate.location.kind === "container" ||
          candidate.location.kind === "corpse") &&
        candidate.location.containerId === container.id &&
        candidate.location.slot === input.destination?.slot,
    );
    if (occupant) {
      if (!canMergeItems(catalog, root, occupant, root.count)) return null;
      mergeTarget = occupant;
    }
    finalLocation = {
      kind: "container",
      containerId: container.id,
      slot: input.destination.slot,
    };
  } else {
    const backpack = carried.items.find(
      (item) =>
        item.location.kind === "equipment" && item.location.slot === "backpack",
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
            canMergeItems(catalog, root, candidate, root.count),
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
    ...root,
    count: root.count + (mergeTarget?.count ?? 0),
    location: finalLocation,
    version: root.version + 1,
  };
  if (mergeTarget) {
    rowOps.push({
      kind: "delete",
      itemId: mergeTarget.id,
      expectedVersion: mergeTarget.version,
    });
    removedItemIds.push(mergeTarget.id);
  }
  const origin = world.lootOrigin(root.id);
  if (pristine) {
    rowOps.push({ kind: "insert", item: final, seed: pristine.seed });
    for (const content of pristine.contents) {
      rowOps.push({ kind: "insert", item: content, seed: pristine.seed });
    }
  } else if (origin) {
    rowOps.push({ kind: "insert", item: final });
    audits.push({
      kind: "loot-created",
      itemId: root.id,
      eventId: origin.eventId,
      killerCharacterId: origin.killerCharacterId,
      typeId: root.typeId,
      count: root.count,
    });
    appendUnpersistedLootInserts(world, children, rowOps, audits);
  } else {
    rowOps.push({ kind: "write", expectedVersion: root.version, item: final });
  }
  if (mergeTarget) {
    audits.push({
      kind: "merge",
      survivorItemId: root.id,
      sourceItemId: mergeTarget.id,
      movedCount: mergeTarget.count,
      sourceRemaining: 0,
      resultCount: final.count,
    });
  }
  audits.push({
    kind: "transfer",
    itemId: root.id,
    from: root.location,
    to: final.location,
    count: final.count,
  });
  return {
    mutation: {
      before: root,
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
