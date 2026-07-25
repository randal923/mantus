import type { ItemMutation } from "../item/ItemMutation";

/** One reward stack the server already rolled, with its catalog facts. */
export interface ChestRewardGrant {
  readonly typeId: number;
  readonly count: number;
  readonly stackable: boolean;
  readonly maxCount: number;
}

/**
 * A fully server-decided chest loot grant. Every value here is derived from
 * the pinned chest table and the tick's RNG — nothing comes from the client.
 */
export interface ChestLootRequest {
  readonly uniqueId: number;
  /** Durable gate identity; shared by Canary's paired chests. */
  readonly lootedKey: string;
  /** Set for repeatable chests; absent means one-time. */
  readonly cooldownSeconds?: number;
  readonly rewards: ReadonlyArray<ChestRewardGrant>;
  /** Rewards land inside a freshly granted container of this type. */
  readonly container?: { readonly typeId: number; readonly capacity: number };
}

export type ChestLootResult =
  | { readonly status: "committed"; readonly mutation: ItemMutation }
  | { readonly status: "already-looted" }
  | { readonly status: "no-space" };

export interface ChestStore {
  /**
   * Claims the character's looted gate and grants the reward in one
   * transaction. Returns "already-looted" when the gate was already taken, so
   * a replayed use can never grant twice.
   */
  loot(
    characterId: string,
    request: ChestLootRequest,
  ): Promise<ChestLootResult>;
}
