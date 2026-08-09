import type { Item } from "../item/Item";
import type { StorePurchaseEffect } from "./StorePurchaseEffect";
import type { MantusStorePurchaseFailure } from "./MantusStoreStore";

/** One bound-container row the tick already placed and the persist must write. */
export interface PlannedBoundRow {
  readonly id: string;
  readonly itemTypeId: number;
  readonly count: number;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly slot: number;
  /** Idempotency key for this row's delivery record. */
  readonly deliveryKey: string;
}

/**
 * Everything the behind-the-tick transaction needs to make a memory-first
 * purchase durable. The offer is still resolved from the server's pinned
 * catalog by id inside the persist; nothing here widens what a purchase can
 * write. Item ids and slots are pinned to what the tick already injected into
 * the live inventory, so the durable rows match memory exactly.
 */
export interface StorePurchasePersistPlan {
  readonly accountId: string;
  readonly characterId: string;
  readonly offerId: string;
  readonly requestKey: string;
  /** The price memory charged; the persist refuses to debit more or less. */
  readonly price: number;
  /** Only set by a premium offer; null leaves premium_until untouched. */
  readonly premiumUntil: Date | null;
  /** XP boost only: the counter value the charged price was derived from. */
  readonly xpBoostCountBefore?: number;
  /** Item-kind offers only: the rows the tick already placed. */
  readonly boundDelivery?: {
    readonly createBoundRoot: boolean;
    readonly boundRootId: string;
    readonly rows: ReadonlyArray<PlannedBoundRow>;
  };
}

/** The tick-side outcome of a planned purchase, applied before persisting. */
export type PlannedStorePurchase =
  | {
      readonly status: "planned";
      readonly price: number;
      readonly balanceAfter: number;
      readonly premiumUntil: Date | null;
      readonly effect: StorePurchaseEffect;
      readonly deliveredItems: ReadonlyArray<Item>;
      /** Present when a missing bound container must be created first. */
      readonly boundRootItem?: Item;
      readonly persist: StorePurchasePersistPlan;
    }
  | { readonly status: MantusStorePurchaseFailure };
