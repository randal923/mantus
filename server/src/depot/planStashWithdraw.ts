import { randomUUID } from "node:crypto";
import { DEPOT_LIMITS } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { carriedWeight } from "./carriedWeight";
import type { DepotCache } from "./DepotCache";
import type { DepotMutationPlan } from "./DepotMutationPlan";
import type { DepotPersistAudit, DepotPersistRowOp } from "./DepotPersistPlan";
import { findCarriedDestinations } from "./findCarriedDestinations";

const MAX_CARRIED_ITEMS = 500;

export function planStashWithdraw(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: {
    readonly items: ReadonlyArray<Item>;
    readonly capacityMax: number;
  };
  readonly depot: DepotCache;
  readonly expectedStashRevision: number;
  readonly itemTypeId: number;
  readonly count: number;
}): DepotMutationPlan {
  const { characterId, catalog, carried, depot, count } = input;
  if (depot.stashRevision !== input.expectedStashRevision) {
    return { status: "stale" };
  }
  const type = catalog.get(input.itemTypeId);
  if (
    !type ||
    !type.stowable ||
    !type.pickupable ||
    !type.movable ||
    type.containerCapacity !== undefined ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > DEPOT_LIMITS.maxTransferCount
  ) {
    return { status: "stash-only" };
  }
  const currentCount = depot.stash.get(input.itemTypeId) ?? 0;
  if (currentCount < count) return { status: "not-owned" };
  if (
    carriedWeight(catalog, carried.items) + type.weight * count >
    carried.capacityMax * 100
  ) {
    return { status: "no-capacity" };
  }
  const mergeTargets = type.stackable
    ? [...carried.items]
        .sort((left, right) => left.id.localeCompare(right.id))
        .filter(
          (candidate) =>
            candidate.typeId === input.itemTypeId &&
            !candidate.seedKey &&
            candidate.count < type.maxCount &&
            Object.keys(candidate.attributes).length === 0,
        )
    : [];
  const mergeCapacity = mergeTargets.reduce(
    (total, target) => total + type.maxCount - target.count,
    0,
  );
  const unmergedCount = Math.max(0, count - mergeCapacity);
  const createdRowCount = type.stackable
    ? Math.ceil(unmergedCount / type.maxCount)
    : count;
  if (carried.items.length + createdRowCount > MAX_CARRIED_ITEMS) {
    return { status: "no-space" };
  }
  const destinations = findCarriedDestinations(
    catalog,
    carried.items,
    createdRowCount,
  );
  if (destinations.length !== createdRowCount) return { status: "no-space" };

  const rowOps: DepotPersistRowOp[] = [];
  const audits: DepotPersistAudit[] = [];
  const withdrawalItems: Item[] = [];
  let remaining = count;
  for (const target of mergeTargets) {
    if (remaining === 0) break;
    const added = Math.min(type.maxCount - target.count, remaining);
    if (added < 1) continue;
    const merged: Item = {
      ...target,
      count: target.count + added,
      version: target.version + 1,
    };
    rowOps.push({
      kind: "write",
      expectedVersion: target.version,
      item: merged,
    });
    withdrawalItems.push(merged);
    audits.push({
      kind: "stash-created",
      itemId: merged.id,
      itemTypeId: input.itemTypeId,
      count: added,
    });
    remaining -= added;
  }
  for (const destination of destinations) {
    const createdCount = type.stackable ? Math.min(type.maxCount, remaining) : 1;
    const created: Item = {
      id: randomUUID(),
      typeId: input.itemTypeId,
      count: createdCount,
      attributes: {},
      version: 1,
      location: destination,
    };
    rowOps.push({ kind: "insert", item: created });
    withdrawalItems.push(created);
    audits.push({
      kind: "stash-created",
      itemId: created.id,
      itemTypeId: input.itemTypeId,
      count: createdCount,
    });
    remaining -= createdCount;
  }
  if (remaining !== 0) throw new Error("stash withdrawal plan is incomplete");
  return {
    status: "ok",
    inventoryMutation: { after: withdrawalItems },
    cacheEvent: {
      stashSets: [
        { itemTypeId: input.itemTypeId, count: currentCount - count },
      ],
      bumps: [{ kind: "stash" }],
    },
    persist: {
      characterId,
      rowOps,
      stashOps: [{ itemTypeId: input.itemTypeId, count: currentCount - count }],
      claimDeliveryItemIds: [],
      revisionBumps: [{ kind: "stash" }],
      audits,
    },
  };
}
