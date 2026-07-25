import type { Item } from "../item/Item";

export interface TradeCommitLeg {
  readonly giverCharacterId: string;
  readonly receiverCharacterId: string;
  /** Reserved subtree snapshot, root first, on a trade-reservation slot. */
  readonly items: ReadonlyArray<Item>;
  readonly receiverCapacityMax: number;
}

export interface TradeCommitInput {
  readonly tradeId: string;
  readonly legs: readonly [TradeCommitLeg, TradeCommitLeg];
}

export type TradeCommitResult =
  | {
      readonly status: "committed";
      /** Delivered subtrees per input leg, roots re-located to receivers. */
      readonly delivered: readonly [ReadonlyArray<Item>, ReadonlyArray<Item>];
    }
  | {
      readonly status: "no-capacity" | "no-room";
      readonly failedCharacterId: string;
    }
  | { readonly status: "failed" };

export type TradeRestoreResult =
  | { readonly status: "committed"; readonly item: Item }
  | { readonly status: "inbox-full" | "not-reserved" };

export interface TradeStore {
  /** Reserved roots plus nested contents left behind by an interrupted trade. */
  loadReservations(characterId: string): Promise<ReadonlyArray<Item>>;
  /**
   * Last-resort return for a reservation its owner has no room to carry:
   * moves the root into their own inbox in one transaction, audited. The
   * `trade-reservation` guard makes a retry a no-op, so recovery running
   * twice cannot deliver twice.
   */
  restoreToInbox(
    characterId: string,
    itemId: string,
  ): Promise<TradeRestoreResult>;
  /**
   * Swaps both reserved legs in one serializable transaction: re-verifies
   * both roots (location, version) at execution time, re-checks each
   * receiver's capacity and room from DB state, moves both roots, and
   * appends both audit entries in the same transaction — commit or nothing.
   */
  commitTrade(input: TradeCommitInput): Promise<TradeCommitResult>;
}
