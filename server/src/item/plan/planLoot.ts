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
import { planBackpackPlacement } from "./planBackpackPlacement";
import { planContainerFrontInsertion } from "./planContainerFrontInsertion";
import { planItemPouchPlacement } from "./planItemPouchPlacement";
import { subtreeHeight } from "./subtreeHeight";
import type { WorldItemsView } from "./WorldItemsView";

const MAX_CARRIED_ITEMS = 500;

/**
 * Takes one child of an open world container (corpse, chest, or a container
 * nested inside one) into the carried inventory. `containerId` is the world
 * root the view is anchored on; the item may sit anywhere inside that root's
 * subtree, and its parentage is re-derived here rather than trusted.
 * Ownership protection, reach, and the open view are re-checked by the caller
 * at execution time; this plans the atomic move itself.
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
    item.id === root.id ||
    (item.location.kind !== "corpse" && item.location.kind !== "container") ||
    item.version !== input.expectedVersion ||
    !world
      .getWorldSubtree(root.id)
      .some((candidate) => candidate.id === item.id)
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
  let frontInsertion: ReturnType<typeof planContainerFrontInsertion> = null;

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
    if (
      input.destination.placement === "front" &&
      input.destination.slot !== 0
    ) {
      return null;
    }
    const ancestry = containerAncestryChain(carriedById, container);
    if (ancestry.length + subtreeHeight(subtree, item.id) > 8) return null;
    const occupant = carried.items.find(
      (candidate) =>
        (candidate.location.kind === "container" ||
          candidate.location.kind === "corpse") &&
        candidate.location.containerId === container.id &&
        candidate.location.slot === input.destination?.slot,
    );
    if (occupant && canMergeItems(catalog, item, occupant, item.count)) {
      mergeTarget = occupant;
    } else if (input.destination.placement === "front") {
      frontInsertion = planContainerFrontInsertion({
        characterId,
        items: carried.items,
        containerId: container.id,
        capacity,
        sourceItemId: item.id,
      });
      if (!frontInsertion) return null;
    } else if (occupant) {
      return null;
    }
    finalLocation = {
      kind: "container",
      containerId: container.id,
      slot: input.destination.slot,
    };
  } else {
    // A carried Item Pouch claims all destination-less loot (auto loot, quick
    // loot, hand loot without an aimed slot) before normal backpack fill.
    const placement =
      planItemPouchPlacement({
        catalog,
        carried: carried.items,
        item,
        subtree,
      }) ??
      planBackpackPlacement({
        catalog,
        carried: carried.items,
        item,
        subtree,
      });
    if (!placement) return null;
    finalLocation = placement.location;
    mergeTarget = placement.mergeTarget;
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
  if (frontInsertion) rowOps.push(...frontInsertion.stageOps);
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
  const seed = world.seedOrigin(item.id);
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
  } else if (seed) {
    // First touch of a chest a player only looked into: the row appears now,
    // carrying the seed identity the unique index dedupes on.
    rowOps.push({ kind: "insert", item: final, seed });
  } else {
    rowOps.push({ kind: "write", expectedVersion: item.version, item: final });
  }
  if (frontInsertion) {
    rowOps.push(...frontInsertion.writeOps);
    audits.push(...frontInsertion.audits);
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
      after: [final, ...children, ...(frontInsertion?.after ?? [])],
      ...(removedItemIds.length > 0 ? { removedItemIds } : {}),
    },
    persist: { characterId, rowOps, audits },
  };
}
