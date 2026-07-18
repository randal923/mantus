import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemMutation } from "../item/ItemMutation";
import { carriedWeight } from "./carriedWeight";
import { collectDescendantItems } from "./collectDescendantItems";
import type { DepotCache } from "./DepotCache";
import type { DepotMutationPlan } from "./DepotMutationPlan";
import type { DepotPersistAudit, DepotPersistRowOp } from "./DepotPersistPlan";
import { findCarriedDestinations } from "./findCarriedDestinations";
import { resolveStoredRoot } from "./resolveStoredRoot";

const MAX_CARRIED_ITEMS = 500;

export function planDepotWithdraw(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: {
    readonly items: ReadonlyArray<Item>;
    readonly capacityMax: number;
  };
  readonly depot: DepotCache;
  readonly depotId: number;
  readonly source: "depot" | "inbox";
  readonly expectedSourceRevision: number;
  readonly itemId: string;
  readonly expectedItemRevision: number;
}): DepotMutationPlan {
  const { characterId, catalog, carried, depot, depotId, source } = input;
  const currentRevision =
    source === "depot"
      ? (depot.depotRevisions.get(depotId) ?? 1)
      : depot.inboxRevision;
  if (currentRevision !== input.expectedSourceRevision) {
    return { status: "stale" };
  }
  const itemsById = new Map(depot.items.map((item) => [item.id, item]));
  const item = itemsById.get(input.itemId);
  if (!item || item.version !== input.expectedItemRevision) {
    return { status: "stale" };
  }
  const root = resolveStoredRoot(itemsById, item);
  const rootMatchesSource =
    source === "depot"
      ? root.location.kind === "depot" && root.location.depotId === depotId
      : root.location.kind === "inbox";
  if (!rootMatchesSource) return { status: "not-owned" };
  const type = catalog.require(item.typeId);
  const descendants = collectDescendantItems(depot.items, item.id);
  const subtree = [item, ...descendants];
  const mergeTargets =
    type.stackable && subtree.length === 1
      ? findWithdrawMergeTargets(carried.items, item, type.maxCount)
      : [];
  const mergeCapacity = mergeTargets.reduce(
    (total, target) => total + type.maxCount - target.count,
    0,
  );
  const remainingAfterMerge = Math.max(0, item.count - mergeCapacity);
  const needsDestination = remainingAfterMerge > 0;
  if (
    carried.items.length + (needsDestination ? subtree.length : 0) >
    MAX_CARRIED_ITEMS
  ) {
    return { status: "no-space" };
  }
  const usedWeight = carriedWeight(catalog, carried.items);
  const addedWeight = carriedWeight(catalog, subtree);
  if (usedWeight + addedWeight > carried.capacityMax * 100) {
    return { status: "no-capacity" };
  }
  const [destination] = needsDestination
    ? findCarriedDestinations(catalog, carried.items, characterId, 1)
    : [];
  if (needsDestination && !destination) return { status: "no-space" };

  const operation = source === "depot" ? "depot-withdrawal" : "inbox-claim";
  const rowOps: DepotPersistRowOp[] = [];
  const audits: DepotPersistAudit[] = [];
  const mergedItems: Item[] = [];
  const removedItemIds: string[] = [];
  let sourceAfter: Item | null = null;
  let remaining = item.count;
  for (const target of mergeTargets) {
    const available = type.maxCount - target.count;
    if (available < 1 || remaining < 1) continue;
    if (item.seedKey && remaining <= available) {
      // Seeded items must survive as rows: absorb the carried stack into the
      // seeded item and move it onto the target's slot instead.
      rowOps.push({
        kind: "delete",
        itemId: target.id,
        expectedVersion: target.version,
      });
      const movedIn: Item = {
        ...item,
        count: target.count + remaining,
        location: target.location,
        version: item.version + 1,
      };
      rowOps.push({
        kind: "write",
        expectedVersion: item.version,
        item: movedIn,
      });
      sourceAfter = movedIn;
      removedItemIds.push(target.id);
      audits.push({
        kind: "merge",
        survivorItemId: item.id,
        sourceItemId: target.id,
        movedCount: target.count,
        sourceRemaining: 0,
        resultCount: movedIn.count,
        operation,
      });
      remaining = 0;
      break;
    }
    const added = Math.min(available, remaining);
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
    remaining -= added;
    mergedItems.push(merged);
    audits.push({
      kind: "merge",
      survivorItemId: merged.id,
      sourceItemId: item.id,
      movedCount: added,
      sourceRemaining: remaining,
      resultCount: merged.count,
      operation,
    });
  }
  if (remaining > 0) {
    if (!destination) throw new Error("inventory destination is missing");
    const moved: Item = {
      ...item,
      count: remaining,
      location: destination,
      version: item.version + 1,
    };
    rowOps.push({ kind: "write", expectedVersion: item.version, item: moved });
    sourceAfter = moved;
  } else if (!item.seedKey) {
    rowOps.push({
      kind: "delete",
      itemId: item.id,
      expectedVersion: item.version,
    });
    removedItemIds.push(item.id);
  }
  const transferTarget = sourceAfter ?? mergedItems[mergedItems.length - 1];
  if (!transferTarget) throw new Error("withdrawal produced no item");
  audits.push({
    kind: "transfer",
    itemId: item.id,
    operation,
    before: item.location,
    after: transferTarget.location,
  });
  const inventoryMutation: ItemMutation = {
    before: item,
    after: [
      ...mergedItems,
      ...(sourceAfter ? [sourceAfter] : []),
      ...descendants,
    ],
    ...(removedItemIds.length > 0 ? { removedItemIds } : {}),
  };
  return {
    status: "ok",
    inventoryMutation,
    cacheEvent: {
      removedItemIds: subtree.map((member) => member.id),
      bumps: [
        source === "depot"
          ? { kind: "depot", depotId }
          : { kind: "inbox" },
      ],
    },
    persist: {
      characterId,
      rowOps,
      stashOps: [],
      claimDeliveryItemIds: source === "inbox" ? [item.id] : [],
      revisionBumps: [
        source === "depot" ? { kind: "depot", depotId } : { kind: "inbox" },
      ],
      audits,
    },
  };
}

function findWithdrawMergeTargets(
  carried: ReadonlyArray<Item>,
  item: Item,
  maxCount: number,
): Item[] {
  const attributes = JSON.stringify(item.attributes);
  return [...carried]
    .sort((left, right) => left.id.localeCompare(right.id))
    .filter(
      (candidate) =>
        candidate.typeId === item.typeId &&
        !candidate.seedKey &&
        candidate.count < maxCount &&
        JSON.stringify(candidate.attributes) === attributes,
    );
}
