import { z } from "zod";

// Feature 84 — boss reward chests. Mechanics transcribed from pinned Canary:
// score split reward_chest.lua:28-65, loot factor :79-83, bonus rolls
// :84-103 (bosstiary slot bonus / boosted +250%), bag expiry 7 days at save
// time (iologindata_save_player.cpp:624), reward containers cap 32
// (reward.cpp:13).

export const REWARD_LIMITS = {
  /** Reward bags kept per character; matches the collect cap territory. */
  maxBags: 200,
  /** Canary Reward container maxSize. */
  maxItemsPerBag: 32,
  /** Bags older than this are dropped (7 days, ms). */
  expiryMs: 604_800_000,
  /** One collect intent per 300 ms per session. */
  collectCooldownMs: 300,
} as const;

export const rewardBagItemSchema = z
  .object({
    itemId: z.string().uuid(),
    itemTypeId: z.number().int().min(1).max(65_535),
    count: z.number().int().min(1).max(100),
    /** Catalog display data so the chest renders without a client lookup. */
    name: z.string().min(1).max(100),
    spriteId: z.number().int().nonnegative(),
  })
  .strict();
export type RewardBagItem = z.infer<typeof rewardBagItemSchema>;

export const rewardBagSchema = z
  .object({
    bagId: z.string().uuid(),
    /** Server clock at the boss kill; drives the 7-day expiry. */
    createdAtMs: z.number().int().nonnegative(),
    expiresAtMs: z.number().int().nonnegative(),
    bossName: z.string().min(1).max(100),
    items: z.array(rewardBagItemSchema).max(REWARD_LIMITS.maxItemsPerBag),
  })
  .strict();
export type RewardBag = z.infer<typeof rewardBagSchema>;

/** Sent only to the owner after opening a reward chest or collecting. */
export const rewardChestStateMessageSchema = z
  .object({
    type: z.literal("reward-chest-state"),
    bags: z.array(rewardBagSchema).max(REWARD_LIMITS.maxBags),
  })
  .strict();

/**
 * Collect one item (itemId set) or a whole bag. The server re-checks chest
 * reach, ownership, expiry, capacity and weight at execution time.
 */
export const rewardCollectMessageSchema = z
  .object({
    type: z.literal("reward-collect"),
    bagId: z.string().uuid(),
    itemId: z.string().uuid().optional(),
  })
  .strict();

export const rewardActionFailedMessageSchema = z
  .object({
    type: z.literal("reward-action-failed"),
    reason: z.enum([
      "invalid-request",
      "not-found",
      "no-space",
      "too-heavy",
      "out-of-reach",
      "rate-limited",
      "busy",
    ]),
  })
  .strict();
export type RewardActionFailedReason = z.infer<
  typeof rewardActionFailedMessageSchema
>["reason"];
