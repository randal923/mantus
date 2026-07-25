import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";

/**
 * One decay step for an item a character is carrying or wearing: an equipped
 * ring reaching the end of its burn, a torch going out in a backpack. The
 * item transforms into its decay target, or is destroyed when the target is
 * zero — Canary's `decayTo`. Identity is re-checked here at execution time
 * (charter rule 4): a record for a moved, transformed, or already-decayed item
 * plans nothing.
 */
export function planCarriedDecay(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly expectedTypeId: number;
}): CarriedPlan | null {
  const { characterId, catalog, items } = input;
  const item = items.find((candidate) => candidate.id === input.itemId);
  if (
    !item ||
    item.version !== input.expectedVersion ||
    item.typeId !== input.expectedTypeId ||
    item.location.kind === "world"
  ) {
    return null;
  }
  const decay = catalog.get(item.typeId)?.decay;
  if (!decay?.durationSeconds) return null;
  const targetTypeId = decay.targetId ?? 0;
  const target = targetTypeId > 0 ? catalog.get(targetTypeId) : undefined;
  if (target) {
    const final: Item = {
      ...item,
      typeId: target.id,
      count: target.stackable ? item.count : 1,
      version: item.version + 1,
    };
    return {
      mutation: { before: item, after: [final] },
      persist: {
        characterId,
        rowOps: [
          { kind: "write", expectedVersion: item.version, item: final },
        ],
        audits: [
          {
            kind: "transform",
            itemId: item.id,
            fromTypeId: item.typeId,
            toTypeId: target.id,
          },
        ],
      },
    };
  }
  // Destroyed: the contents go with it, deepest first so no row is orphaned.
  const contained = descendants(items, item.id);
  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  for (const doomed of [...contained].reverse()) {
    rowOps.push({
      kind: "delete",
      itemId: doomed.id,
      expectedVersion: doomed.version,
    });
    audits.push({
      kind: "destruction",
      itemId: doomed.id,
      typeId: doomed.typeId,
      count: doomed.count,
      reason: "decay",
    });
  }
  rowOps.push({
    kind: "delete",
    itemId: item.id,
    expectedVersion: item.version,
  });
  audits.push({
    kind: "destruction",
    itemId: item.id,
    typeId: item.typeId,
    count: item.count,
    reason: "decay",
  });
  return {
    mutation: {
      before: item,
      after: [],
      removedItemIds: [item.id, ...contained.map((entry) => entry.id)],
    },
    persist: { characterId, rowOps, audits },
  };
}

/** Every item inside `containerId`, parents before children. */
function descendants(
  items: ReadonlyArray<Item>,
  containerId: string,
): Item[] {
  const found: Item[] = [];
  const queue = [containerId];
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (parentId === undefined) break;
    for (const item of items) {
      if (
        (item.location.kind !== "container" &&
          item.location.kind !== "corpse") ||
        item.location.containerId !== parentId
      ) {
        continue;
      }
      found.push(item);
      queue.push(item.id);
    }
  }
  return found;
}
