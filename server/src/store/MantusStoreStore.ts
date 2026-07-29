import type { StoreHistoryEntry } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { StorePurchaseEffect } from "./StorePurchaseEffect";

/** Everything the availability check needs that is not already in memory. */
export interface StoreDbFacts {
  /** Of the queried unique product ids, the ones already owned. */
  readonly ownedUniqueItemTypeIds: ReadonlyArray<number>;
  /** XP boosts already bought today, for the cap and the price curve. */
  readonly xpBoostPurchasesToday: number;
}

export type MantusStorePurchaseFailure =
  | "insufficient-coins"
  | "offer-not-found"
  | "premium-limit"
  | "inbox-full"
  | "already-owned"
  | "outfit-required"
  | "wrong-sex"
  | "limit-reached"
  | "name-taken"
  | "name-invalid"
  | "name-required"
  | "unavailable"
  | "failed";

export type MantusStorePurchaseResult =
  | {
      readonly status: "committed";
      readonly balance: number;
      /** Unchanged for non-premium offers; extended for premium ones. */
      readonly premiumUntil: Date | null;
      /** The price actually charged, which the server computed. */
      readonly price: number;
      /** What the tick must apply to the live world; null for a replay. */
      readonly effect: StorePurchaseEffect | null;
      /** Rows delivered to the buyer's inbox, when the offer grants any. */
      readonly deliveredItems: ReadonlyArray<Item>;
    }
  | { readonly status: MantusStorePurchaseFailure };

export type MantusStoreGrantResult =
  | { readonly status: "committed"; readonly balance: number }
  | { readonly status: "balance-limit" | "unavailable" };

export type MantusStoreRefundResult =
  | { readonly status: "committed"; readonly balance: number }
  | {
      readonly status:
        | "entry-not-found"
        | "already-refunded"
        | "balance-limit"
        | "unavailable";
    };

export interface MantusStoreStore {
  /**
   * Buys one catalog offer. The offer is resolved from the *server's* pinned
   * catalog by id, so price, product and delivery never come off the wire.
   * `requestId` makes the whole purchase — coin debit and every delivery row
   * — idempotent: a replayed key returns the first outcome instead of
   * charging again.
   */
  purchase(input: {
    readonly accountId: string;
    readonly characterId: string;
    readonly offerId: string;
    readonly requestId: string;
    /** Only meaningful for a name-change offer. */
    readonly newName?: string;
  }): Promise<MantusStorePurchaseResult>;
  /**
   * Operator-authorized coin grant. `grantKey` makes a retried grant a no-op;
   * the account is named by the caller's own resolved identity, never by a
   * client message body.
   */
  grant(input: {
    readonly accountId: string;
    readonly amount: number;
    readonly grantKey: string;
    readonly operatorCharacterId: string;
  }): Promise<MantusStoreGrantResult>;
  /** Reverses one purchase ledger entry, once. */
  refund(input: {
    readonly ledgerEntryId: string;
    readonly operatorCharacterId: string;
  }): Promise<MantusStoreRefundResult>;
  /** The account's own coin ledger, newest first, bounded. */
  history(
    accountId: string,
    limit: number,
  ): Promise<ReadonlyArray<StoreHistoryEntry>>;
  /** Display-only facts for greying out offers the player cannot buy. */
  facts(
    characterId: string,
    uniqueItemTypeIds: ReadonlyArray<number>,
  ): Promise<StoreDbFacts>;
}
