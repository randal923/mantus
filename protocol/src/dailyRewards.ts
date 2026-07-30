import { z } from "zod";
import { accountTierSchema } from "./account";

// Feature 84 — daily rewards. Transcribed from pinned Canary
// data/modules/scripts/daily_reward/daily_reward.lua: the 7-day table
// (:106-151), the per-vocation item pools (:68-75), streak advance
// (:255-274) and the joker/miss rules (:295-334). Deviations recorded in
// the backlog: the day boundary is the server-local calendar day (mantus
// has no global server save), and items grant to carried slots instead of
// Canary's store inbox.

export const DAILY_REWARD_RULES = {
  cycleDays: 7,
  maxJokerTokens: 3,
  /** Day-7 boost: +50% kill experience for the granted minutes. */
  xpBoostPercent: 50,
  /** One claim intent per 300 ms per session. */
  claimCooldownMs: 300,
  /** One history request per second per session. */
  historyCooldownMs: 1_000,
  /** Entries the history reply carries (Canary daily_reward.lua:220). */
  historyLimit: 15,
  /**
   * Streak level each resting-area bonus needs. Applied inside protection
   * zones by `CharacterProgression.tick` and `regenerateRestingStamina`
   * (Canary condition.cpp:1490-1535, daily_reward.lua's RegenStamina /
   * RegenSoul events), and drawn as the six shields in the reward wall.
   */
  streakBonuses: {
    hpRegeneration: 2,
    mpRegeneration: 3,
    staminaRegeneration: 4,
    doubleHpRegeneration: 5,
    doubleMpRegeneration: 6,
    soulRegeneration: 7,
  },
} as const;

export const DAILY_REWARD_KINDS = [
  "vocation-items",
  "wildcards",
  "training-items",
  "xp-boost",
] as const;
export const dailyRewardKindSchema = z.enum(DAILY_REWARD_KINDS);
export type DailyRewardKind = z.infer<typeof dailyRewardKindSchema>;

export interface DailyRewardDay {
  readonly kind: DailyRewardKind;
  /** Item units / wildcards / boost minutes, by account tier. */
  readonly free: number;
  readonly premium: number;
}

/** Canary daily_reward.lua:106-151, day 1 first. */
export const DAILY_REWARD_TABLE: ReadonlyArray<DailyRewardDay> = [
  { kind: "vocation-items", free: 5, premium: 10 },
  { kind: "vocation-items", free: 5, premium: 10 },
  { kind: "wildcards", free: 1, premium: 2 },
  { kind: "vocation-items", free: 10, premium: 20 },
  { kind: "wildcards", free: 1, premium: 2 },
  { kind: "training-items", free: 1, premium: 2 },
  { kind: "xp-boost", free: 10, premium: 30 },
];

const poolEntrySchema = z
  .object({
    itemTypeId: z.number().int().min(1).max(65_535),
    name: z.string().min(1).max(100),
    spriteId: z.number().int().nonnegative(),
  })
  .strict();
export type DailyRewardPoolEntry = z.infer<typeof poolEntrySchema>;

/** Pushed after using a reward shrine; lists only the session's own state. */
export const dailyRewardsStateMessageSchema = z
  .object({
    type: z.literal("daily-rewards-state"),
    /** 0..6 position in the cycle; the next claim pays day position+1. */
    streakPosition: z.number().int().min(0).max(6),
    streakLevel: z.number().int().nonnegative(),
    jokerTokens: z.number().int().min(0).max(3),
    claimableToday: z.boolean(),
    /** Days the streak would lose to the gap; jokers absorb them first. */
    missedDays: z.number().int().nonnegative(),
    xpBoostUntilMs: z.number().int().nonnegative(),
    /**
     * Epoch ms at which the server-local day flips — the claim deadline the
     * window counts down to. The client cannot derive it: its time zone need
     * not match the server's, and the server's day is the real one.
     */
    dayEndsAtMs: z.number().int().nonnegative(),
    /** Drives the premium panel; the allowance below already accounts for it. */
    accountTier: accountTierSchema,
    /** Today's pickable pool (empty for wildcard/boost days). */
    pool: z.array(poolEntrySchema).max(40),
    /** Item units (or wildcards/minutes) today's claim grants this account. */
    allowance: z.number().int().nonnegative(),
  })
  .strict();

const historyItemSchema = z
  .object({
    itemTypeId: z.number().int().min(1).max(65_535),
    name: z.string().min(1).max(100),
    count: z.number().int().min(1).max(100),
  })
  .strict();

const historyEntrySchema = z
  .object({
    claimedAtMs: z.number().int().nonnegative(),
    /** 1..7 day of the cycle the claim paid. */
    rewardDay: z.number().int().min(1).max(7),
    kind: dailyRewardKindSchema,
    /** Units, wildcards or boost minutes the claim paid. */
    allowance: z.number().int().nonnegative(),
    /** Empty for wildcard and boost days. */
    items: z.array(historyItemSchema).max(10),
  })
  .strict();
export type DailyRewardHistoryEntry = z.infer<typeof historyEntrySchema>;

/**
 * Ask for this character's own claim history (Canary daily_reward.lua:213-233
 * keeps the last 15). Entries are structured rather than Canary's prebuilt
 * sentence so the window can render them in the player's language.
 * One request per second per session; the reply is capped at 15 entries.
 */
export const dailyHistoryGetMessageSchema = z
  .object({ type: z.literal("daily-history-get") })
  .strict();

export const dailyRewardHistoryMessageSchema = z
  .object({
    type: z.literal("daily-reward-history"),
    entries: z.array(historyEntrySchema).max(15),
  })
  .strict();

const pickSchema = z
  .object({
    itemTypeId: z.number().int().min(1).max(65_535),
    count: z.number().int().min(1).max(100),
  })
  .strict();
export type DailyRewardPick = z.infer<typeof pickSchema>;

/**
 * Claim today's reward. Picks apply to item days only; the server re-checks
 * pool membership, the unit allowance, shrine reach, and the once-per-day
 * gate at execution time.
 */
export const dailyClaimMessageSchema = z
  .object({
    type: z.literal("daily-claim"),
    picks: z.array(pickSchema).max(10),
  })
  .strict();

export const dailyActionFailedMessageSchema = z
  .object({
    type: z.literal("daily-action-failed"),
    reason: z.enum([
      "invalid-request",
      "already-claimed",
      "invalid-picks",
      "no-space",
      "out-of-reach",
      "rate-limited",
      "busy",
    ]),
  })
  .strict();
export type DailyActionFailedReason = z.infer<
  typeof dailyActionFailedMessageSchema
>["reason"];
