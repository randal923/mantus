import { DEPOT_LIMITS } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { DepotCache } from "./DepotCache";
import type { DepotMutationPlan } from "./DepotMutationPlan";

export function planStashDeposit(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: { readonly items: ReadonlyArray<Item> };
  readonly depot: DepotCache;
  readonly expectedStashRevision: number;
  readonly itemId: string;
  readonly expectedItemRevision: number;
  readonly count: number;
}): DepotMutationPlan {
  const { characterId, catalog, carried, depot, count } = input;
  if (depot.stashRevision !== input.expectedStashRevision) {
    return { status: "stale" };
  }
  const item = carried.items.find((candidate) => candidate.id === input.itemId);
  if (!item || item.version !== input.expectedItemRevision) {
    return { status: "stale" };
  }
  if (
    item.location.kind !== "inventory" &&
    item.location.kind !== "container"
  ) {
    return { status: "invalid-item" };
  }
  const type = catalog.require(item.typeId);
  if (
    !type.stowable ||
    !type.pickupable ||
    !type.movable ||
    type.containerCapacity !== undefined ||
    Object.keys(item.attributes).length > 0
  ) {
    return { status: "stash-only" };
  }
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > item.count ||
    (!type.stackable && count !== item.count)
  ) {
    return { status: "invalid-item" };
  }
  const nextStashCount = (depot.stash.get(item.typeId) ?? 0) + count;
  if (nextStashCount > DEPOT_LIMITS.maxStashAmount) {
    return { status: "no-space" };
  }
  if (count === item.count) {
    return {
      status: "ok",
      inventoryMutation: {
        before: item,
        after: [],
        removedItemIds: [item.id],
      },
      cacheEvent: {
        stashSets: [{ itemTypeId: item.typeId, count: nextStashCount }],
        bumps: [{ kind: "stash" }],
      },
      persist: {
        characterId,
        rowOps: [
          { kind: "delete", itemId: item.id, expectedVersion: item.version },
        ],
        stashOps: [{ itemTypeId: item.typeId, count: nextStashCount }],
        claimDeliveryItemIds: [],
        revisionBumps: [{ kind: "stash" }],
        audits: [
          {
            kind: "stash-deposit",
            itemId: item.id,
            itemTypeId: item.typeId,
            count,
          },
        ],
      },
    };
  }
  const decremented: Item = {
    ...item,
    count: item.count - count,
    version: item.version + 1,
  };
  return {
    status: "ok",
    inventoryMutation: { before: item, after: [decremented] },
    cacheEvent: {
      stashSets: [{ itemTypeId: item.typeId, count: nextStashCount }],
      bumps: [{ kind: "stash" }],
    },
    persist: {
      characterId,
      rowOps: [
        { kind: "write", expectedVersion: item.version, item: decremented },
      ],
      stashOps: [{ itemTypeId: item.typeId, count: nextStashCount }],
      claimDeliveryItemIds: [],
      revisionBumps: [{ kind: "stash" }],
      audits: [
        {
          kind: "stash-deposit",
          itemId: item.id,
          itemTypeId: item.typeId,
          count,
        },
      ],
    },
  };
}
