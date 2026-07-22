import { DEPOT_LIMITS } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { collectDescendantItems } from "./collectDescendantItems";
import type { DepotCache } from "./DepotCache";
import type { DepotMutationPlan } from "./DepotMutationPlan";
import { depotSnapshotOf } from "./depotSnapshotOf";
import { firstFreeDepotSlot } from "./firstFreeDepotSlot";

export function planDepotDeposit(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: { readonly items: ReadonlyArray<Item> };
  readonly depot: DepotCache;
  readonly depotId: number;
  readonly expectedDepotRevision: number;
  readonly itemId: string;
  readonly expectedItemRevision: number;
}): DepotMutationPlan {
  const { characterId, catalog, carried, depot, depotId } = input;
  if (
    (depot.depotRevisions.get(depotId) ?? 1) !== input.expectedDepotRevision
  ) {
    return { status: "stale" };
  }
  const item = carried.items.find((candidate) => candidate.id === input.itemId);
  if (!item || item.version !== input.expectedItemRevision) {
    return { status: "stale" };
  }
  if (item.location.kind !== "container") {
    return { status: "invalid-item" };
  }
  const type = catalog.require(item.typeId);
  if (!type.pickupable || !type.movable) return { status: "invalid-item" };
  const descendants = collectDescendantItems(carried.items, item.id);
  const subtreeSize = descendants.length + 1;
  if (
    depotSnapshotOf(depot, depotId).depotCount + subtreeSize >
    DEPOT_LIMITS.maxDepotItems
  ) {
    return { status: "depot-full" };
  }
  const slot = firstFreeDepotSlot(depot, depotId);
  if (slot === null) return { status: "depot-full" };
  const moved: Item = {
    ...item,
    location: { kind: "depot", characterId, depotId, slot },
    version: item.version + 1,
  };
  return {
    status: "ok",
    inventoryMutation: { before: item, after: [moved] },
    cacheEvent: {
      upserts: [moved, ...descendants],
      bumps: [{ kind: "depot", depotId }],
    },
    persist: {
      characterId,
      rowOps: [{ kind: "write", expectedVersion: item.version, item: moved }],
      stashOps: [],
      claimDeliveryItemIds: [],
      revisionBumps: [{ kind: "depot", depotId }],
      audits: [
        {
          kind: "transfer",
          itemId: item.id,
          operation: "depot-deposit",
          before: item.location,
          after: moved.location,
        },
      ],
    },
  };
}
