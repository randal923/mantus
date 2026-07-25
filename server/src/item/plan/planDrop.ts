import { randomUUID } from "node:crypto";
import type { Position } from "@tibia/protocol";
import { collectDescendantItems } from "../../depot/collectDescendantItems";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import { appendMergeTargetPersist } from "./appendMergeTargetPersist";
import type { CarriedPlan } from "./CarriedPlan";
import { findWorldMergeTarget } from "./findWorldMergeTarget";
import { firstFreeWorldStackIndex } from "./firstFreeWorldStackIndex";
import { isTrashholderTile } from "./isTrashholderTile";
import { planTrashDrop } from "./planTrashDrop";
import type { WorldItemsView } from "./WorldItemsView";

export function planDrop(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: { readonly items: ReadonlyArray<Item> };
  readonly world: WorldItemsView;
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly position: Position;
  readonly requestedCount?: number;
}): CarriedPlan | null {
  const { characterId, catalog, carried, world, position } = input;
  const item = carried.items.find((candidate) => candidate.id === input.itemId);
  if (!item || item.version !== input.expectedVersion) return null;
  const type = catalog.require(item.typeId);
  if (!type.movable) return null;
  const count = input.requestedCount ?? item.count;
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > item.count ||
    (!type.stackable && count !== 1)
  ) {
    return null;
  }
  if (isTrashholderTile(world.getMapItems(position), catalog)) {
    return planTrashDrop({
      characterId,
      carriedItems: carried.items,
      item,
      count,
      position,
    });
  }
  const mergeTarget =
    type.stackable && !item.seedKey
      ? findWorldMergeTarget(catalog, world, position, item)
      : undefined;
  if (mergeTarget) {
    const merged: Item = {
      ...mergeTarget,
      count: mergeTarget.count + count,
      version: mergeTarget.version + 1,
    };
    const rowOps: CarriedPersistRowOp[] = [];
    const audits: CarriedPersistAudit[] = [];
    if (count === item.count) {
      appendMergeTargetPersist(world, mergeTarget, merged, rowOps, audits);
      rowOps.push({
        kind: "delete",
        itemId: item.id,
        expectedVersion: item.version,
      });
      audits.push({
        kind: "merge",
        survivorItemId: merged.id,
        sourceItemId: item.id,
        movedCount: count,
        sourceRemaining: 0,
        resultCount: merged.count,
      });
      return {
        mutation: {
          before: item,
          after: [merged],
          removedItemIds: [item.id],
        },
        persist: { characterId, rowOps, audits },
      };
    }
    const sourceAfter: Item = {
      ...item,
      count: item.count - count,
      version: item.version + 1,
    };
    rowOps.push({
      kind: "write",
      expectedVersion: item.version,
      item: sourceAfter,
    });
    appendMergeTargetPersist(world, mergeTarget, merged, rowOps, audits);
    audits.push({
      kind: "merge",
      survivorItemId: merged.id,
      sourceItemId: item.id,
      movedCount: count,
      sourceRemaining: sourceAfter.count,
      resultCount: merged.count,
    });
    return {
      mutation: { before: item, after: [sourceAfter, merged] },
      persist: { characterId, rowOps, audits },
    };
  }
  const stackIndex = firstFreeWorldStackIndex(world.getMapItems(position));
  if (stackIndex === null) return null;
  if (count === item.count) {
    const descendants = collectDescendantItems(carried.items, item.id);
    const final: Item = {
      ...item,
      location: { kind: "world", position: { ...position }, stackIndex },
      version: item.version + 1,
    };
    return {
      mutation: { before: item, after: [final, ...descendants] },
      persist: {
        characterId,
        rowOps: [
          { kind: "write", expectedVersion: item.version, item: final },
        ],
        audits: [
          {
            kind: "transfer",
            itemId: item.id,
            from: item.location,
            to: final.location,
            count: final.count,
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
    location: { kind: "world", position: { ...position }, stackIndex },
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
