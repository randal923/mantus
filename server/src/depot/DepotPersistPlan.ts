import type { Item } from "../item/Item";
import type { ItemLocation } from "../item/ItemLocation";

export type DepotPersistRowOp =
  | {
      readonly kind: "write";
      readonly expectedVersion: number;
      readonly item: Item;
    }
  | { readonly kind: "insert"; readonly item: Item }
  | {
      readonly kind: "delete";
      readonly itemId: string;
      readonly expectedVersion: number;
    };

/** Absolute post-mutation stash count; zero deletes the row. */
export interface DepotPersistStashOp {
  readonly itemTypeId: number;
  readonly count: number;
}

export type DepotRevisionBump =
  | { readonly kind: "depot"; readonly depotId: number }
  | { readonly kind: "inbox" }
  | { readonly kind: "stash" };

export type DepotPersistAudit =
  | {
      readonly kind: "transfer";
      readonly itemId: string;
      readonly operation: string;
      readonly before: ItemLocation;
      readonly after: ItemLocation;
    }
  | {
      readonly kind: "merge";
      readonly survivorItemId: string;
      readonly sourceItemId: string;
      readonly movedCount: number;
      readonly sourceRemaining: number;
      readonly resultCount: number;
      readonly operation: string;
    }
  | {
      readonly kind: "stash-deposit";
      readonly itemId: string;
      readonly itemTypeId: number;
      readonly count: number;
    }
  | {
      readonly kind: "stash-created";
      readonly itemId: string;
      readonly itemTypeId: number;
      readonly count: number;
    };

/**
 * The exact row changes a committed in-memory depot mutation must write to the
 * DB. Every guarded op must affect exactly one row; a miss means memory and DB
 * diverged and the character has to be resynced from the DB.
 */
export interface DepotPersistPlan {
  readonly characterId: string;
  readonly rowOps: ReadonlyArray<DepotPersistRowOp>;
  readonly stashOps: ReadonlyArray<DepotPersistStashOp>;
  readonly claimDeliveryItemIds: ReadonlyArray<string>;
  readonly revisionBumps: ReadonlyArray<DepotRevisionBump>;
  readonly audits: ReadonlyArray<DepotPersistAudit>;
}
