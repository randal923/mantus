import type { RewardBag } from "@tibia/protocol";
import type { ItemMutation } from "../item/ItemMutation";
import type { LootItemCreation } from "../item/LootItemCreation";

export interface RewardGrantRequest {
  /** `boss-reward:<deathEventId>:<characterId>` — the exactly-once key. */
  readonly grantKey: string;
  readonly recipientCharacterId: string;
  readonly bossName: string;
  /** Server clock at the kill; drives the 7-day expiry. */
  readonly createdAtMs: number;
  readonly items: ReadonlyArray<LootItemCreation>;
}

export type RewardGrantResult =
  | { readonly status: "granted"; readonly bagItemId: string | null }
  | { readonly status: "duplicate" }
  | { readonly status: "chest-full" };

export interface RewardChestSnapshot {
  readonly bags: ReadonlyArray<RewardBag>;
}

export type RewardCollectResult =
  | {
      readonly status: "committed";
      readonly mutation: ItemMutation;
      readonly state: RewardChestSnapshot;
    }
  | { readonly status: "not-found" }
  | { readonly status: "no-space" };

export interface RewardStore {
  /** Exactly-once per grant key; a replay reports "duplicate" untouched. */
  grantBossRewards(request: RewardGrantRequest): Promise<RewardGrantResult>;
  /** Deletes expired bags (7 days) and returns the remaining chest. */
  loadRewardChest(
    characterId: string,
    nowMs: number,
  ): Promise<RewardChestSnapshot>;
  /** Moves one item (or the whole bag) into carried slots, atomically. */
  collect(
    characterId: string,
    bagItemId: string,
    itemId: string | null,
    nowMs: number,
  ): Promise<RewardCollectResult>;
}
