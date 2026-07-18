import { randomUUID } from "node:crypto";
import type { CarriedPersistAudit, CarriedPersistRowOp } from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";
import { canMergeItems } from "./canMergeItems";
import { containerPlacementAllowed } from "./containerPlacementAllowed";
import { firstFreeInventorySlot } from "./firstFreeInventorySlot";

const MAX_CARRIED_ITEMS = 500;

export function planMoveToContainer(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly destinationContainerId: string;
  readonly destinationVersion: number;
  readonly destinationSlot: number;
  readonly requestedCount?: number;
}): CarriedPlan | null {
  const { characterId, catalog, items, destinationSlot } = input;
  const itemsById = new Map(items.map((entry) => [entry.id, entry]));
  const item = itemsById.get(input.itemId);
  const destination = itemsById.get(input.destinationContainerId);
  if (!item || item.version !== input.expectedVersion) return null;
  if (!destination || destination.version !== input.destinationVersion) {
    return null;
  }
  if (
    item.location.kind !== "inventory" &&
    item.location.kind !== "container"
  ) {
    return null;
  }
  if (item.id === destination.id) return null;
  const type = catalog.require(item.typeId);
  const destinationCapacity =
    catalog.require(destination.typeId).containerCapacity ?? 0;
  if (destinationCapacity < 1) return null;
  if (
    !Number.isInteger(destinationSlot) ||
    destinationSlot < 0 ||
    destinationSlot >= destinationCapacity
  ) {
    return null;
  }
  const count = input.requestedCount ?? item.count;
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > item.count ||
    (!type.stackable && count !== 1)
  ) {
    return null;
  }
  if (count < item.count && items.length >= MAX_CARRIED_ITEMS) return null;
  if (
    item.location.kind === "container" &&
    item.location.containerId === destination.id &&
    item.location.slot === destinationSlot
  ) {
    return null;
  }
  if (!containerPlacementAllowed(items, itemsById, item.id, destination)) {
    return null;
  }
  const slotTarget = items.find(
    (candidate) =>
      (candidate.location.kind === "container" ||
        candidate.location.kind === "corpse") &&
      candidate.location.containerId === destination.id &&
      candidate.location.slot === destinationSlot,
  );
  const mergeTarget =
    type.stackable && canMergeItems(catalog, item, slotTarget, count)
      ? slotTarget
      : undefined;
  if (slotTarget && !mergeTarget) {
    return planSwap(input.characterId, catalog, items, itemsById, item, destination, destinationSlot, slotTarget, count);
  }
  if (mergeTarget) {
    if (count === item.count && item.seedKey) {
      const after: Item = {
        ...item,
        count: item.count + mergeTarget.count,
        location: {
          kind: "container",
          containerId: destination.id,
          slot: destinationSlot,
        },
        version: item.version + 1,
      };
      return {
        mutation: {
          before: item,
          after: [after],
          removedItemIds: [mergeTarget.id],
        },
        persist: {
          characterId,
          rowOps: [
            {
              kind: "delete",
              itemId: mergeTarget.id,
              expectedVersion: mergeTarget.version,
            },
            { kind: "write", expectedVersion: item.version, item: after },
          ],
          audits: [
            {
              kind: "merge",
              survivorItemId: item.id,
              sourceItemId: mergeTarget.id,
              movedCount: mergeTarget.count,
              sourceRemaining: 0,
              resultCount: after.count,
            },
            {
              kind: "transfer",
              itemId: item.id,
              from: item.location,
              to: after.location,
              count: after.count,
            },
          ],
        },
      };
    }
    if (count === item.count) {
      const merged: Item = {
        ...mergeTarget,
        count: mergeTarget.count + count,
        version: mergeTarget.version + 1,
      };
      return {
        mutation: {
          before: item,
          after: [merged],
          removedItemIds: [item.id],
        },
        persist: {
          characterId,
          rowOps: [
            {
              kind: "write",
              expectedVersion: mergeTarget.version,
              item: merged,
            },
            { kind: "delete", itemId: item.id, expectedVersion: item.version },
          ],
          audits: [
            {
              kind: "merge",
              survivorItemId: merged.id,
              sourceItemId: item.id,
              movedCount: count,
              sourceRemaining: 0,
              resultCount: merged.count,
            },
          ],
        },
      };
    }
    const merged: Item = {
      ...mergeTarget,
      count: mergeTarget.count + count,
      version: mergeTarget.version + 1,
    };
    const sourceAfter: Item = {
      ...item,
      count: item.count - count,
      version: item.version + 1,
    };
    return {
      mutation: { before: item, after: [sourceAfter, merged] },
      persist: {
        characterId,
        rowOps: [
          { kind: "write", expectedVersion: mergeTarget.version, item: merged },
          { kind: "write", expectedVersion: item.version, item: sourceAfter },
        ],
        audits: [
          {
            kind: "merge",
            survivorItemId: merged.id,
            sourceItemId: item.id,
            movedCount: count,
            sourceRemaining: sourceAfter.count,
            resultCount: merged.count,
          },
        ],
      },
    };
  }
  if (count === item.count) {
    const after: Item = {
      ...item,
      location: {
        kind: "container",
        containerId: destination.id,
        slot: destinationSlot,
      },
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
        ],
      },
    };
  }
  const sourceAfter: Item = {
    ...item,
    count: item.count - count,
    version: item.version + 1,
  };
  const created: Item = {
    id: randomUUID(),
    typeId: item.typeId,
    count,
    attributes: item.attributes,
    version: 1,
    location: {
      kind: "container",
      containerId: destination.id,
      slot: destinationSlot,
    },
  };
  return {
    mutation: { before: item, after: [sourceAfter, created] },
    persist: {
      characterId,
      rowOps: [
        { kind: "write", expectedVersion: item.version, item: sourceAfter },
        { kind: "insert", item: created },
      ],
      audits: [
        {
          kind: "split",
          itemId: item.id,
          originalCount: item.count,
          remainingCount: sourceAfter.count,
          createdItemId: created.id,
          createdCount: created.count,
          destination: created.location,
        },
      ],
    },
  };
}

function planSwap(
  characterId: string,
  catalog: ItemCatalog,
  items: ReadonlyArray<Item>,
  itemsById: ReadonlyMap<string, Item>,
  item: Item,
  destination: Item,
  destinationSlot: number,
  slotTarget: Item,
  count: number,
): CarriedPlan | null {
  if (count !== item.count) return null;
  if (item.location.kind === "container") {
    const sourceContainer = itemsById.get(item.location.containerId);
    if (
      !sourceContainer ||
      !containerPlacementAllowed(items, itemsById, slotTarget.id, sourceContainer)
    ) {
      return null;
    }
  }
  const temporarySlot = firstFreeInventorySlot(items);
  if (temporarySlot === null) return null;
  const after: Item = {
    ...item,
    location: {
      kind: "container",
      containerId: destination.id,
      slot: destinationSlot,
    },
    version: item.version + 1,
  };
  const displaced: Item = {
    ...slotTarget,
    location: item.location,
    version: slotTarget.version + 1,
  };
  const rowOps: CarriedPersistRowOp[] = [
    // Stage the displaced item on a free inventory slot so the partial
    // unique indexes never collide mid-transaction.
    {
      kind: "write",
      expectedVersion: slotTarget.version,
      item: {
        ...slotTarget,
        location: { kind: "inventory", characterId, slot: temporarySlot },
        version: slotTarget.version + 1,
      },
    },
    { kind: "write", expectedVersion: item.version, item: after },
    { kind: "write", expectedVersion: displaced.version, item: displaced },
  ];
  const audits: CarriedPersistAudit[] = [
    {
      kind: "transfer",
      itemId: item.id,
      from: item.location,
      to: after.location,
      count: after.count,
    },
    {
      kind: "transfer",
      itemId: slotTarget.id,
      from: slotTarget.location,
      to: displaced.location,
      count: displaced.count,
    },
  ];
  return {
    mutation: { before: item, after: [after, displaced] },
    persist: { characterId, rowOps, audits },
  };
}
