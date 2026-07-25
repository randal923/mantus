import type { StoreHistoryEntry, StoreOffer } from "@tibia/protocol";
import type { Item } from "../item/Item";

export type MantusStorePurchaseResult =
  | {
      readonly status: "committed";
      readonly balance: number;
      /** Unchanged for item offers; extended for premium-time offers. */
      readonly premiumUntil: Date | null;
      /** The row delivered to the buyer's inbox, when the offer grants one. */
      readonly deliveredItem: Item | null;
    }
  | {
      readonly status:
        | "insufficient-coins"
        | "premium-limit"
        | "inbox-full"
        | "unavailable";
    };

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
  purchase(input: {
    readonly accountId: string;
    readonly characterId: string;
    readonly offer: StoreOffer;
    /**
     * Idempotency key for the whole purchase, including its inbox delivery.
     * A replayed key returns the first outcome instead of charging again.
     */
    readonly requestId: string;
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
}
