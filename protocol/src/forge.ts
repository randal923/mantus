import { z } from "zod";

/**
 * Exaltation Forge (Feature 78), transcribed from pinned Canary
 * configmanager.cpp (FORGE_* defaults), tools.cpp:1847-1882 (`forgeBonus`),
 * player.cpp:11036-11567 (fusion/transfer/conversions), game.cpp:11840-12200
 * (influenced/fiendish lifecycle), and data/scripts/systems/item_tiers.lua
 * (price tables). Every conversion is a server-side ACID transaction; these
 * constants exist so the client can render costs and the server and tests
 * share one source.
 */
export const FORGE_RULES = {
  sliverItemTypeId: 37_109,
  coreItemTypeId: 37_110,
  exaltationChestItemTypeId: 37_561,
  maxItemTier: 10,
  fusionDustCost: 100,
  convergenceFusionDustCost: 130,
  transferDustCost: 100,
  convergenceTransferDustCost: 160,
  /** Fusion success: 50% base, +15% with an exalted core. */
  baseSuccessPercent: 50,
  coreSuccessPercent: 15,
  /** A tier-loss core halves the 100% loss chance on failure. */
  tierLossReductionPercent: 50,
  /** 20 dust per sliver, minted 3 at a time (60 dust -> 3 slivers). */
  dustPerSliver: 20,
  sliversPerConversion: 3,
  /** 50 slivers -> 1 exalted core. */
  sliverCoreCost: 50,
  /** Dust cap starts at 100; raising by 1 costs (current cap - 75) dust. */
  initialDustLimit: 100,
  maxDustLimit: 225,
  dustLimitCostOffset: 75,
  /** Monster-state stacks: influenced roll 1..5, fiendish fixed 15. */
  influencedMaxStack: 5,
  fiendishStack: 15,
  /** Kill dust: random(stack, 3 * stack), clamped to the dust cap. */
  dustPerStackMultiplier: 3,
  /** Fiendish corpses carry uniform(3, 7) slivers. */
  fiendishMinSlivers: 3,
  fiendishMaxSlivers: 7,
  /** Concurrent monster-state caps (config.lua.dist ships fiendish 4). */
  influencedLimit: 300,
  fiendishLimit: 4,
  /** A fiendish monster reverts after one hour. */
  fiendishDurationMs: 3_600_000,
  /** Replenish delays after a state is consumed (game.cpp:12036-12055). */
  influencedRespawnDelayMs: 10_000,
  fiendishRespawnDelayMs: 270_000,
  /** The state sweep interval (game.cpp:878-881, EVENT_MS). */
  sweepIntervalMs: 10_000,
  /** One forge mutation per session per this window. */
  actionCooldownMs: 300,
  historyPageSize: 9,
} as const;

/**
 * Canary tools.cpp:1847-1882 — the fusion bonus roll over uniform(0, 10000).
 * Index 8 is only ever assigned on failure when the second item kept its
 * tier (the tier-loss core saved it).
 */
export const FORGE_BONUS_THRESHOLDS = [
  { bonus: 1, from: 7_400, to: 8_999 },
  { bonus: 2, from: 9_000, to: 9_499 },
  { bonus: 3, from: 9_500, to: 9_524 },
  { bonus: 4, from: 9_525, to: 9_549 },
  { bonus: 5, from: 9_550, to: 9_949 },
  { bonus: 6, from: 9_950, to: 9_974 },
  { bonus: 7, from: 9_975, to: 10_000 },
] as const;

export interface ForgeTierPrice {
  readonly corePrice: number;
  readonly regularPrice: number;
  readonly convergenceFusionPrice: number;
  readonly convergenceTransferPrice: number;
}

/**
 * data/scripts/systems/item_tiers.lua — gold/core costs per classification
 * and TARGET tier (fusion pays tiers[tier+1]; transfer pays the receiver's
 * resulting tier). Classes 1-3 cannot converge (price 0 = unavailable).
 */
export const FORGE_TIER_PRICES: Readonly<
  Record<number, Readonly<Record<number, ForgeTierPrice>>>
> = {
  1: {
    1: { corePrice: 1, regularPrice: 25_000, convergenceFusionPrice: 0, convergenceTransferPrice: 0 },
  },
  2: {
    1: { corePrice: 1, regularPrice: 750_000, convergenceFusionPrice: 0, convergenceTransferPrice: 0 },
    2: { corePrice: 1, regularPrice: 5_000_000, convergenceFusionPrice: 0, convergenceTransferPrice: 0 },
  },
  3: {
    1: { corePrice: 1, regularPrice: 4_000_000, convergenceFusionPrice: 0, convergenceTransferPrice: 0 },
    2: { corePrice: 2, regularPrice: 10_000_000, convergenceFusionPrice: 0, convergenceTransferPrice: 0 },
    3: { corePrice: 3, regularPrice: 20_000_000, convergenceFusionPrice: 0, convergenceTransferPrice: 0 },
  },
  4: {
    1: { corePrice: 1, regularPrice: 8_000_000, convergenceFusionPrice: 55_000_000, convergenceTransferPrice: 65_000_000 },
    2: { corePrice: 2, regularPrice: 20_000_000, convergenceFusionPrice: 110_000_000, convergenceTransferPrice: 165_000_000 },
    3: { corePrice: 5, regularPrice: 40_000_000, convergenceFusionPrice: 170_000_000, convergenceTransferPrice: 375_000_000 },
    4: { corePrice: 10, regularPrice: 65_000_000, convergenceFusionPrice: 300_000_000, convergenceTransferPrice: 800_000_000 },
    5: { corePrice: 15, regularPrice: 100_000_000, convergenceFusionPrice: 875_000_000, convergenceTransferPrice: 2_000_000_000 },
    6: { corePrice: 25, regularPrice: 250_000_000, convergenceFusionPrice: 2_350_000_000, convergenceTransferPrice: 5_250_000_000 },
    7: { corePrice: 35, regularPrice: 750_000_000, convergenceFusionPrice: 6_950_000_000, convergenceTransferPrice: 14_500_000_000 },
    8: { corePrice: 50, regularPrice: 2_500_000_000, convergenceFusionPrice: 21_250_000_000, convergenceTransferPrice: 42_500_000_000 },
    9: { corePrice: 60, regularPrice: 8_000_000_000, convergenceFusionPrice: 50_000_000_000, convergenceTransferPrice: 100_000_000_000 },
    10: { corePrice: 85, regularPrice: 15_000_000_000, convergenceFusionPrice: 125_000_000_000, convergenceTransferPrice: 300_000_000_000 },
  },
} as const;

/** Max tier for a classification (4 -> config maxItemTier, else itself). */
export function forgeMaxTierFor(classification: number): number {
  if (classification <= 0) return 0;
  return classification === 4 ? FORGE_RULES.maxItemTier : classification;
}

/**
 * Tier-bonus quadratics (configmanager.cpp:183-217): percent chance =
 * a * tier^2 + b * tier + c; tier 0 is always 0. Amplification (boots)
 * multiplies the other four as chance * (1 + amplification / 100).
 */
export const TIER_BONUS_FORMULAS = {
  onslaught: { a: 0.05, b: 0.4, c: 0.05 },
  ruse: { a: 0.0307576, b: 0.440697, c: 0.026 },
  momentum: { a: 0.05, b: 1.9, c: 0.05 },
  transcendence: { a: 0.0127, b: 0.107, c: 0.0073 },
  amplification: { a: 0.4, b: 1.7, c: 0.4 },
} as const;

export type TierBonusKind = keyof typeof TIER_BONUS_FORMULAS;

export function tierBonusPercent(kind: TierBonusKind, tier: number): number {
  if (tier <= 0) return 0;
  const { a, b, c } = TIER_BONUS_FORMULAS[kind];
  return a * tier * tier + b * tier + c;
}

const itemIdSchema = z.string().uuid();

export const forgeGetMessageSchema = z
  .object({ type: z.literal("forge-get") })
  .strict();

export const forgeFusionMessageSchema = z
  .object({
    type: z.literal("forge-fusion"),
    firstItemId: itemIdSchema,
    secondItemId: itemIdSchema,
    usedCore: z.boolean(),
    reduceTierLoss: z.boolean(),
    convergence: z.boolean(),
  })
  .strict();

export const forgeTransferMessageSchema = z
  .object({
    type: z.literal("forge-transfer"),
    donorItemId: itemIdSchema,
    receiverItemId: itemIdSchema,
    convergence: z.boolean(),
  })
  .strict();

export const forgeConversionMessageSchema = z
  .object({
    type: z.literal("forge-conversion"),
    conversion: z.enum([
      "dust-to-slivers",
      "slivers-to-cores",
      "increase-dust-limit",
    ]),
  })
  .strict();

export const forgeHistoryGetMessageSchema = z
  .object({
    type: z.literal("forge-history-get"),
    page: z.number().int().min(0).max(1_000),
  })
  .strict();

/** Own forge resource balances; slivers/cores are carried item counts. */
export const forgeStateMessageSchema = z
  .object({
    type: z.literal("forge-state"),
    dusts: z.number().int().min(0).max(FORGE_RULES.maxDustLimit),
    dustLimit: z
      .number()
      .int()
      .min(FORGE_RULES.initialDustLimit)
      .max(FORGE_RULES.maxDustLimit),
    slivers: z.number().int().min(0),
    cores: z.number().int().min(0),
  })
  .strict();

export const forgeResultMessageSchema = z
  .object({
    type: z.literal("forge-result"),
    action: z.enum(["fusion", "transfer"]),
    convergence: z.boolean(),
    success: z.boolean(),
    /** Canary forgeBonus 0..8; 0 = none, 8 = failure without tier loss. */
    bonus: z.number().int().min(0).max(8),
    itemTypeId: z.number().int().min(1).max(65_535),
    resultTier: z.number().int().min(0).max(FORGE_RULES.maxItemTier),
  })
  .strict();

const forgeHistoryEntrySchema = z
  .object({
    at: z.number().int().min(0),
    action: z.enum([
      "fusion",
      "transfer",
      "dust-to-slivers",
      "slivers-to-cores",
      "increase-dust-limit",
    ]),
    convergence: z.boolean(),
    success: z.boolean(),
    bonus: z.number().int().min(0).max(8),
    tier: z.number().int().min(0).max(FORGE_RULES.maxItemTier),
    description: z.string().max(300),
    costGold: z.number().int().min(0),
    costDust: z.number().int().min(0),
    costCores: z.number().int().min(0),
    gained: z.number().int().min(0),
  })
  .strict();

export const forgeHistoryStateMessageSchema = z
  .object({
    type: z.literal("forge-history-state"),
    page: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    entries: z
      .array(forgeHistoryEntrySchema)
      .max(FORGE_RULES.historyPageSize),
  })
  .strict();

export const forgeActionFailedMessageSchema = z
  .object({
    type: z.literal("forge-action-failed"),
    reason: z.enum([
      "invalid-item",
      "item-imbued",
      "tier-limit",
      "not-convergible",
      "insufficient-dust",
      "insufficient-slivers",
      "insufficient-cores",
      "insufficient-gold",
      "dust-limit-reached",
      "backpack-full",
      "rate-limited",
      "invalid-request",
    ]),
  })
  .strict();

export type ForgeGetMessage = z.infer<typeof forgeGetMessageSchema>;
export type ForgeFusionMessage = z.infer<typeof forgeFusionMessageSchema>;
export type ForgeTransferMessage = z.infer<typeof forgeTransferMessageSchema>;
export type ForgeConversionMessage = z.infer<typeof forgeConversionMessageSchema>;
export type ForgeHistoryGetMessage = z.infer<typeof forgeHistoryGetMessageSchema>;
export type ForgeStateMessage = z.infer<typeof forgeStateMessageSchema>;
export type ForgeResultMessage = z.infer<typeof forgeResultMessageSchema>;
export type ForgeHistoryEntry = z.infer<typeof forgeHistoryEntrySchema>;
export type ForgeHistoryStateMessage = z.infer<
  typeof forgeHistoryStateMessageSchema
>;
export type ForgeActionFailedMessage = z.infer<
  typeof forgeActionFailedMessageSchema
>;
export type ForgeActionFailedReason = ForgeActionFailedMessage["reason"];
