import { z } from "zod";
import { damageTypeSchema } from "./combat";

/**
 * Cyclopedia character views (Feature 83), mirroring Canary's 0xE5 request
 * with its ownership gate (game.cpp:9787-9793: only the requesting
 * character's own data) and paging clamps (protocolgame.cpp:2969-2987).
 * Every view is a bounded, authorized projection — never a raw game-state
 * query. The general/achievements/titles/badges/outfits/monster/house tabs
 * reuse existing own-state and profile projections; these messages cover
 * what those do not.
 */
export const CYCLOPEDIA_LIMITS = {
  pageSize: 15,
  maxPage: 200,
  /** Canary windows: deaths 30 days, PvP kills 70 days. */
  deathsWindowDays: 30,
  pvpKillsWindowDays: 70,
  maxItemSummaryEntries: 600,
  maxCauseLength: 200,
  /** One cyclopedia request per session per this window. */
  actionCooldownMs: 300,
} as const;

export const CYCLOPEDIA_VIEWS = [
  "combat",
  "deaths",
  "pvp-kills",
  "item-summary",
] as const;

export const cyclopediaCharacterGetMessageSchema = z
  .object({
    type: z.literal("cyclopedia-character-get"),
    view: z.enum(CYCLOPEDIA_VIEWS),
    page: z.number().int().min(0).max(CYCLOPEDIA_LIMITS.maxPage).optional(),
  })
  .strict();

/** Own combat stats, computed server-side from live equipment and bonuses. */
export const cyclopediaCombatStateMessageSchema = z
  .object({
    type: z.literal("cyclopedia-combat-state"),
    criticalChancePercent: z.number().min(0).max(200),
    criticalDamagePercent: z.number().min(0).max(500),
    lifeLeechPercent: z.number().min(0).max(200),
    manaLeechPercent: z.number().min(0).max(200),
    attackSkill: z.number().int().min(0).max(1_000),
    attackValue: z.number().int().min(0).max(1_000),
    defenseValue: z.number().int().min(0).max(10_000),
    armorValue: z.number().int().min(0).max(10_000),
    mitigationPercent: z.number().min(0).max(100),
    /** Forge tier bonuses, amplification already composed. */
    onslaughtPercent: z.number().min(0).max(100),
    rusePercent: z.number().min(0).max(100),
    momentumPercent: z.number().min(0).max(100),
    absorbs: z
      .array(
        z
          .object({
            element: damageTypeSchema,
            percent: z.number().int().min(-1_000).max(100),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();

const cyclopediaDeathEntrySchema = z
  .object({
    at: z.number().int().min(0),
    level: z.number().int().min(1),
    cause: z.string().min(1).max(CYCLOPEDIA_LIMITS.maxCauseLength),
  })
  .strict();

export const cyclopediaDeathsStateMessageSchema = z
  .object({
    type: z.literal("cyclopedia-deaths-state"),
    page: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    entries: z
      .array(cyclopediaDeathEntrySchema)
      .max(CYCLOPEDIA_LIMITS.pageSize),
  })
  .strict();

const cyclopediaPvpKillEntrySchema = z
  .object({
    at: z.number().int().min(0),
    description: z.string().min(1).max(120),
    status: z.enum(["justified", "unjustified"]),
  })
  .strict();

export const cyclopediaPvpKillsStateMessageSchema = z
  .object({
    type: z.literal("cyclopedia-pvp-kills-state"),
    page: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    entries: z
      .array(cyclopediaPvpKillEntrySchema)
      .max(CYCLOPEDIA_LIMITS.pageSize),
  })
  .strict();

const cyclopediaItemCountSchema = z
  .object({
    itemTypeId: z.number().int().min(1).max(65_535),
    tier: z.number().int().min(0).max(10),
    count: z.number().int().min(1),
  })
  .strict();

/** Own items grouped by (type, tier) per storage area (Canary's summary). */
export const cyclopediaItemSummaryStateMessageSchema = z
  .object({
    type: z.literal("cyclopedia-item-summary-state"),
    carried: z
      .array(cyclopediaItemCountSchema)
      .max(CYCLOPEDIA_LIMITS.maxItemSummaryEntries),
    depot: z
      .array(cyclopediaItemCountSchema)
      .max(CYCLOPEDIA_LIMITS.maxItemSummaryEntries),
    inbox: z
      .array(cyclopediaItemCountSchema)
      .max(CYCLOPEDIA_LIMITS.maxItemSummaryEntries),
    stash: z
      .array(cyclopediaItemCountSchema)
      .max(CYCLOPEDIA_LIMITS.maxItemSummaryEntries),
  })
  .strict();

export const cyclopediaActionFailedMessageSchema = z
  .object({
    type: z.literal("cyclopedia-action-failed"),
    reason: z.enum(["rate-limited", "unavailable", "invalid-request"]),
  })
  .strict();

export type CyclopediaView = (typeof CYCLOPEDIA_VIEWS)[number];
export type CyclopediaCharacterGetMessage = z.infer<
  typeof cyclopediaCharacterGetMessageSchema
>;
export type CyclopediaCombatStateMessage = z.infer<
  typeof cyclopediaCombatStateMessageSchema
>;
export type CyclopediaDeathEntry = z.infer<typeof cyclopediaDeathEntrySchema>;
export type CyclopediaDeathsStateMessage = z.infer<
  typeof cyclopediaDeathsStateMessageSchema
>;
export type CyclopediaPvpKillEntry = z.infer<
  typeof cyclopediaPvpKillEntrySchema
>;
export type CyclopediaPvpKillsStateMessage = z.infer<
  typeof cyclopediaPvpKillsStateMessageSchema
>;
export type CyclopediaItemCount = z.infer<typeof cyclopediaItemCountSchema>;
export type CyclopediaItemSummaryStateMessage = z.infer<
  typeof cyclopediaItemSummaryStateMessageSchema
>;
export type CyclopediaActionFailedMessage = z.infer<
  typeof cyclopediaActionFailedMessageSchema
>;
export type CyclopediaActionFailedReason =
  CyclopediaActionFailedMessage["reason"];
