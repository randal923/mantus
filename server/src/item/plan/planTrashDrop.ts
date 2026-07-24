import type { Position } from "@tibia/protocol";
import { collectDescendantItems } from "../../depot/collectDescendantItems";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { CarriedPlan } from "./CarriedPlan";
import { TRASH_DESTRUCTION_EFFECT_ID } from "./isTrashholderTile";

/**
 * Destroys a carried item dropped onto a trashholder tile instead of placing
 * it. Destruction is a single atomic operation (charter rule 2) and an audited
 * economy event (rule 11): every destroyed row gets a destruction audit in the
 * same transaction. A partial stack reduces the source; a full drop removes the
 * item and — for a container — its whole nested subtree (persisted rows deleted
 * leaf-first for the RESTRICT container FK; the cache drops them by reachability
 * once the root is gone).
 */
export function planTrashDrop(input: {
  readonly characterId: string;
  readonly carriedItems: ReadonlyArray<Item>;
  readonly item: Item;
  readonly count: number;
  readonly position: Position;
}): CarriedPlan {
  const { characterId, carriedItems, item, count, position } = input;
  const effect = { position: { ...position }, effectId: TRASH_DESTRUCTION_EFFECT_ID };

  if (count < item.count) {
    // Only stackables reach a partial count, so there is no nested subtree.
    const remaining: Item = {
      ...item,
      count: item.count - count,
      version: item.version + 1,
    };
    return {
      mutation: { before: item, after: [remaining] },
      persist: {
        characterId,
        rowOps: [
          { kind: "write", expectedVersion: item.version, item: remaining },
        ],
        audits: [
          {
            kind: "destruction",
            itemId: item.id,
            typeId: item.typeId,
            count,
            reason: "trash",
          },
        ],
      },
      effect,
    };
  }

  const descendants = collectDescendantItems(carriedItems, item.id);
  const destroyed = [item, ...descendants];
  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  // Leaf-first so a parent row is never deleted before its children.
  for (const victim of [...destroyed].reverse()) {
    rowOps.push({
      kind: "delete",
      itemId: victim.id,
      expectedVersion: victim.version,
    });
    audits.push({
      kind: "destruction",
      itemId: victim.id,
      typeId: victim.typeId,
      count: victim.count,
      reason: "trash",
    });
  }
  return {
    mutation: {
      before: item,
      after: [],
      removedItemIds: destroyed.map((victim) => victim.id),
    },
    persist: { characterId, rowOps, audits },
    effect,
  };
}
