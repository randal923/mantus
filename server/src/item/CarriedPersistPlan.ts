import type { Item } from "./Item";
import type { ItemLocation } from "./ItemLocation";

/** Seed provenance for rows materialized in memory from pristine map items. */
export interface PersistSeedData {
  readonly mapName: string;
  readonly mapVersion: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly stackIndex: number;
}

export type CarriedPersistRowOp =
  | {
      readonly kind: "write";
      readonly expectedVersion: number;
      readonly item: Item;
    }
  | { readonly kind: "insert"; readonly item: Item; readonly seed?: PersistSeedData }
  | {
      readonly kind: "delete";
      readonly itemId: string;
      readonly expectedVersion: number;
    };

export type CarriedPersistAudit =
  | {
      readonly kind: "transfer";
      readonly itemId: string;
      readonly from: ItemLocation;
      readonly to: ItemLocation;
      readonly count: number;
    }
  | {
      readonly kind: "merge";
      readonly survivorItemId: string;
      readonly sourceItemId: string;
      readonly movedCount: number;
      readonly sourceRemaining: number;
      readonly resultCount: number;
    }
  | {
      readonly kind: "split";
      readonly itemId: string;
      readonly originalCount: number;
      readonly remainingCount: number;
      readonly createdItemId: string;
      readonly createdCount: number;
      readonly destination: ItemLocation;
    }
  | {
      readonly kind: "transform";
      readonly itemId: string;
      readonly fromTypeId: number;
      readonly toTypeId: number;
    }
  | {
      readonly kind: "written";
      readonly itemId: string;
      readonly previousLength: number;
      readonly length: number;
    };

/**
 * The exact row changes a committed in-memory carried-item mutation must
 * write to the DB. Row ops run in order (swaps stage the displaced item on a
 * temporary slot so the partial unique indexes never collide); a guarded op
 * that misses means memory and DB diverged and the character is resynced.
 */
export interface CarriedPersistPlan {
  readonly characterId: string;
  readonly rowOps: ReadonlyArray<CarriedPersistRowOp>;
  readonly audits: ReadonlyArray<CarriedPersistAudit>;
}
