import type { Position } from "@tibia/protocol";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";
import { findWorldMergeTarget } from "./findWorldMergeTarget";
import { firstFreeWorldStackIndex } from "./firstFreeWorldStackIndex";
import { materializeWorldSource } from "./materializeWorldSource";
import type { WorldItemsView } from "./WorldItemsView";

export function planMoveMapItem(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly world: WorldItemsView;
  readonly itemInstanceId: string;
  readonly expectedVersion: number;
  readonly fromPosition: Position;
  readonly toPosition: Position;
}): CarriedPlan | null {
  const { characterId, catalog, world, fromPosition, toPosition } = input;
  const mapItem = world
    .getMapItems(fromPosition)
    .find((candidate) => candidate.instanceId === input.itemInstanceId);
  if (!mapItem) return null;
  let root = world.getWorldItem(input.itemInstanceId);
  let children: ReadonlyArray<Item> = [];
  let pristine: ReturnType<typeof materializeWorldSource> = null;
  if (root) {
    const location = root.location;
    if (
      location.kind !== "world" ||
      location.position.x !== fromPosition.x ||
      location.position.y !== fromPosition.y ||
      location.position.z !== fromPosition.z
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
  if (!type.movable) return null;

  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  const mergeTarget = type.stackable
    ? findWorldMergeTarget(catalog, world, toPosition, root)
    : undefined;
  if (mergeTarget && root.seedKey) {
    const targetLocation =
      mergeTarget.location.kind === "world" ? mergeTarget.location : undefined;
    if (!targetLocation) return null;
    const final: Item = {
      ...root,
      count: root.count + mergeTarget.count,
      location: {
        kind: "world",
        position: { ...toPosition },
        stackIndex: targetLocation.stackIndex,
      },
      version: root.version + 1,
    };
    rowOps.push({
      kind: "delete",
      itemId: mergeTarget.id,
      expectedVersion: mergeTarget.version,
    });
    if (pristine) {
      rowOps.push({ kind: "insert", item: final, seed: pristine.seed });
      for (const content of pristine.contents) {
        rowOps.push({ kind: "insert", item: content, seed: pristine.seed });
      }
    } else {
      rowOps.push({
        kind: "write",
        expectedVersion: root.version,
        item: final,
      });
    }
    audits.push(
      {
        kind: "merge",
        survivorItemId: root.id,
        sourceItemId: mergeTarget.id,
        movedCount: mergeTarget.count,
        sourceRemaining: 0,
        resultCount: final.count,
      },
      {
        kind: "transfer",
        itemId: root.id,
        from: root.location,
        to: final.location,
        count: final.count,
      },
    );
    return {
      mutation: {
        before: root,
        after: [final, ...children],
        removedItemIds: [mergeTarget.id],
      },
      persist: { characterId, rowOps, audits },
    };
  }
  if (mergeTarget) {
    const merged: Item = {
      ...mergeTarget,
      count: mergeTarget.count + root.count,
      version: mergeTarget.version + 1,
    };
    return {
      mutation: {
        before: root,
        after: [merged],
        removedItemIds: [root.id],
      },
      persist: {
        characterId,
        rowOps: [
          {
            kind: "write",
            expectedVersion: mergeTarget.version,
            item: merged,
          },
          { kind: "delete", itemId: root.id, expectedVersion: root.version },
        ],
        audits: [
          {
            kind: "merge",
            survivorItemId: merged.id,
            sourceItemId: root.id,
            movedCount: root.count,
            sourceRemaining: 0,
            resultCount: merged.count,
          },
        ],
      },
    };
  }
  const stackIndex = firstFreeWorldStackIndex(world.getMapItems(toPosition));
  if (stackIndex === null) return null;
  const final: Item = {
    ...root,
    location: { kind: "world", position: { ...toPosition }, stackIndex },
    version: root.version + 1,
  };
  if (pristine) {
    rowOps.push({ kind: "insert", item: final, seed: pristine.seed });
    for (const content of pristine.contents) {
      rowOps.push({ kind: "insert", item: content, seed: pristine.seed });
    }
  } else {
    rowOps.push({ kind: "write", expectedVersion: root.version, item: final });
  }
  audits.push({
    kind: "transfer",
    itemId: root.id,
    from: root.location,
    to: final.location,
    count: final.count,
  });
  return {
    mutation: { before: root, after: [final, ...children] },
    persist: { characterId, rowOps, audits },
  };
}
