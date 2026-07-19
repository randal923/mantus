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

export interface TradeStore {
  /** Reserved roots plus nested contents left behind by an interrupted trade. */
  loadReservations(characterId: string): Promise<ReadonlyArray<Item>>;
  /**
   * Swaps both reserved legs in one serializable transaction: re-verifies
   * both roots (location, version) at execution time, re-checks each
   * receiver's capacity and room from DB state, moves both roots, and
   * appends both audit entries in the same transaction — commit or nothing.
   */
  commitTrade(input: TradeCommitInput): Promise<TradeCommitResult>;
}
