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
      /** Temporary DB-only state used to avoid unique-slot collisions. */
      readonly kind: "stage";
      readonly itemId: string;
      readonly expectedVersion: number;
      readonly nextVersion: number;
      readonly characterId: string;
      readonly slot: number;
    }
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

/**
 * Why a row lost units. The economy reasons mirror the strings the DB-first
 * shop and bank paths wrote, so the `item-destroyed` audit trail stays
 * comparable across the move to memory-first.
 */
export type CarriedDestructionReason =
  | "food"
  | "trash"
  | "decay"
  | "shop-purchase"
  | "shop-purchase-currency"
  | "shop-sale"
  | "bank-deposit";

/** Why a row gained units, mirroring the DB-first economy reason strings. */
export type CarriedCreationReason =
  | "shop-purchase"
  | "shop-purchase-change"
  | "shop-sale"
  | "shop-sale-currency"
  | "bank-deposit-change"
  | "bank-withdraw"
  | "harvest";

export type CarriedPersistAudit =
  | {
      readonly kind: "destruction";
      readonly itemId: string;
      readonly typeId: number;
      readonly count: number;
      readonly reason: CarriedDestructionReason;
    }
  | {
      readonly kind: "creation";
      readonly itemId: string;
      readonly typeId: number;
      readonly count: number;
      readonly reason: CarriedCreationReason;
    }
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
    }
  | {
      /** First-touch materialization of memory-only kill loot: the row insert
       * and this creation audit land in the same transaction. */
      readonly kind: "loot-created";
      readonly itemId: string;
      readonly eventId: string;
      readonly killerCharacterId: string | null;
      readonly typeId: number;
      readonly count: number;
      /** Rarity grade rolled at drop time; absent on common loot. */
      readonly rarity?: string;
    };

/**
 * The exact row changes a committed in-memory carried-item mutation must
 * write to the DB. Row ops run in order (swaps stage the displaced item on a
 * transaction-only location so the partial unique indexes never collide); a
 * guarded op that misses means memory and DB diverged and the character is
 * resynced.
 */
export interface CarriedPersistPlan {
  readonly characterId: string;
  readonly rowOps: ReadonlyArray<CarriedPersistRowOp>;
  readonly audits: ReadonlyArray<CarriedPersistAudit>;
}
