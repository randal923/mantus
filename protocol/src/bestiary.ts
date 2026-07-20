import { z } from "zod";
import { damageTypeSchema } from "./combat";
import { creatureOutfitSchema } from "./creature";
import { itemTooltipSchema } from "./item";

export const BESTIARY_LIMITS = {
  maxRaceId: 65_535,
  maxKills: 4_294_967_295,
  maxEntries: 2048,
  maxBossEntries: 256,
  maxLootEntries: 64,
  maxItemSources: 64,
  maxLocationsLength: 1024,
  maxNameLength: 100,
  /** One bestiary/bosstiary request per session per this window. */
  actionCooldownMs: 300,
} as const;

/** Canary's BestiaryType_t race classes; the content pipeline validates against this list. */
export const BESTIARY_CLASSES = [
  "Amphibic",
  "Aquatic",
  "Bird",
  "Construct",
  "Demon",
  "Dragon",
  "Elemental",
  "Extra Dimensional",
  "Fey",
  "Giant",
  "Human",
  "Humanoid",
  "Lycanthrope",
  "Magical",
  "Mammal",
  "Plant",
  "Reptile",
  "Slime",
  "Undead",
  "Vermin",
  "Inkborn",
] as const;

export const bestiaryClassSchema = z.enum(BESTIARY_CLASSES);

export const BOSS_CATEGORIES = ["bane", "archfoe", "nemesis"] as const;

export const bossCategorySchema = z.enum(BOSS_CATEGORIES);

/**
 * Kill milestones and boss points per category, mirroring Canary's fixed
 * Prowess/Expertise/Mastery table. Shared so the client can render star
 * tiers without the server re-sending constants.
 */
export const BOSSTIARY_MILESTONES: Record<
  (typeof BOSS_CATEGORIES)[number],
  ReadonlyArray<{ readonly kills: number; readonly points: number }>
> = {
  bane: [
    { kills: 25, points: 5 },
    { kills: 100, points: 15 },
    { kills: 300, points: 30 },
  ],
  archfoe: [
    { kills: 5, points: 10 },
    { kills: 20, points: 30 },
    { kills: 60, points: 60 },
  ],
  nemesis: [
    { kills: 1, points: 10 },
    { kills: 3, points: 30 },
    { kills: 5, points: 60 },
  ],
} as const;

const raceIdSchema = z.number().int().min(1).max(BESTIARY_LIMITS.maxRaceId);

const killsSchema = z.number().int().min(0).max(BESTIARY_LIMITS.maxKills);

/**
 * Completion stage for one bestiary entry. Catalog knowledge is public;
 * stage 4 awards the creature's charm points.
 */
const bestiaryStageSchema = z.number().int().min(0).max(4);

/** One request returns the whole bestiary so the client can cache it. */
export const bestiaryCreaturesGetMessageSchema = z
  .object({ type: z.literal("bestiary-creatures-get") })
  .strict();

export const bestiaryCreatureEntrySchema = z
  .object({
    raceId: raceIdSchema,
    /** Public catalog data; stage tracks charm completion only. */
    name: z.string().min(1).max(BESTIARY_LIMITS.maxNameLength),
    className: bestiaryClassSchema,
    outfit: creatureOutfitSchema,
    stage: bestiaryStageSchema,
    kills: killsSchema,
  })
  .strict();

export const bestiaryCreaturesStateMessageSchema = z
  .object({
    type: z.literal("bestiary-creatures-state"),
    entries: z
      .array(bestiaryCreatureEntrySchema)
      .max(BESTIARY_LIMITS.maxEntries),
    /** Sum of charm points from completed entries (derived, not stored). */
    charmPoints: z.number().int().min(0).max(1_000_000),
  })
  .strict();

export const bestiaryMonsterGetMessageSchema = z
  .object({
    type: z.literal("bestiary-monster-get"),
    raceId: raceIdSchema,
  })
  .strict();

/** One public catalog loot row. */
export const bestiaryLootEntrySchema = z
  .object({
    itemTypeId: z.number().int().min(1).max(65_535),
    spriteId: z.number().int().min(1).max(4_000_000),
    name: z.string().min(1).max(100).optional(),
    /** 0 common .. 4 very rare, derived from drop chance like Canary. */
    rarity: z.number().int().min(0).max(4),
    tooltip: itemTooltipSchema,
  })
  .strict();

export const bestiaryResistanceSchema = z
  .object({
    element: damageTypeSchema,
    /** Damage taken in percent; 100 = neutral, 0 = immune, >100 = weak. */
    percent: z.number().int().min(0).max(1000),
  })
  .strict();

const bestiaryStatsSchema = z
  .object({
    maxHealth: z.number().int().min(1).max(100_000_000),
    experience: z.number().int().min(0).max(100_000_000),
    speed: z.number().int().min(0).max(10_000),
    armor: z.number().int().min(0).max(1000),
    mitigation: z.number().min(0).max(100),
  })
  .strict();

export const bestiaryMonsterStateMessageSchema = z
  .object({
    type: z.literal("bestiary-monster-state"),
    raceId: raceIdSchema,
    name: z.string().min(1).max(BESTIARY_LIMITS.maxNameLength),
    className: bestiaryClassSchema,
    outfit: creatureOutfitSchema,
    stage: bestiaryStageSchema,
    kills: killsSchema,
    firstUnlock: z.number().int().min(1).max(BESTIARY_LIMITS.maxKills),
    secondUnlock: z.number().int().min(1).max(BESTIARY_LIMITS.maxKills),
    toKill: z.number().int().min(1).max(BESTIARY_LIMITS.maxKills),
    stars: z.number().int().min(0).max(5),
    occurrence: z.number().int().min(0).max(4),
    charmPoints: z.number().int().min(0).max(10_000),
    loot: z.array(bestiaryLootEntrySchema).max(BESTIARY_LIMITS.maxLootEntries),
    stats: bestiaryStatsSchema,
    resistances: z.array(bestiaryResistanceSchema).max(12),
    locations: z.string().max(BESTIARY_LIMITS.maxLocationsLength),
  })
  .strict();

export const bosstiaryGetMessageSchema = z
  .object({ type: z.literal("bosstiary-get") })
  .strict();

export const bosstiaryEntrySchema = z
  .object({
    raceId: raceIdSchema,
    /** Public catalog data; kills track boss-point completion only. */
    name: z.string().min(1).max(BESTIARY_LIMITS.maxNameLength),
    outfit: creatureOutfitSchema,
    category: bossCategorySchema,
    kills: killsSchema,
  })
  .strict();

export const bosstiaryStateMessageSchema = z
  .object({
    type: z.literal("bosstiary-state"),
    entries: z.array(bosstiaryEntrySchema).max(BESTIARY_LIMITS.maxBossEntries),
    /** Sum of milestone points reached (derived, not stored). */
    bossPoints: z.number().int().min(0).max(1_000_000),
  })
  .strict();

/** Fixed-size request; served under the shared bestiary read rate limit. */
export const bosstiaryBossGetMessageSchema = z
  .object({ type: z.literal("bosstiary-boss-get"), raceId: raceIdSchema })
  .strict();

export const bosstiaryBossStateMessageSchema = z
  .object({
    type: z.literal("bosstiary-boss-state"),
    raceId: raceIdSchema,
    name: z.string().min(1).max(BESTIARY_LIMITS.maxNameLength),
    outfit: creatureOutfitSchema,
    category: bossCategorySchema,
    kills: killsSchema,
    loot: z.array(bestiaryLootEntrySchema).max(BESTIARY_LIMITS.maxLootEntries),
    stats: bestiaryStatsSchema,
    resistances: z.array(bestiaryResistanceSchema).max(12),
  })
  .strict();

/** Fixed-size item lookup; the server caps both rate and response entries. */
export const wikiItemSourcesGetMessageSchema = z
  .object({
    type: z.literal("wiki-item-sources-get"),
    itemTypeId: z.number().int().min(1).max(65_535),
  })
  .strict();

export const wikiItemSourceSchema = z
  .object({
    scope: z.enum(["bestiary", "bosstiary"]),
    raceId: raceIdSchema,
    name: z.string().min(1).max(BESTIARY_LIMITS.maxNameLength),
    outfit: creatureOutfitSchema,
  })
  .strict();

export const wikiItemSourcesStateMessageSchema = z
  .object({
    type: z.literal("wiki-item-sources-state"),
    itemTypeId: z.number().int().min(1).max(65_535),
    sources: z.array(wikiItemSourceSchema).max(BESTIARY_LIMITS.maxItemSources),
  })
  .strict();

/**
 * Pushed to each credited player on every kill so the client-side cached
 * bestiary/bosstiary stays accurate without refetching.
 */
export const bestiaryEntryChangedMessageSchema = z
  .object({
    type: z.literal("bestiary-entry-changed"),
    scope: z.enum(["bestiary", "bosstiary"]),
    raceId: raceIdSchema,
    name: z.string().min(1).max(BESTIARY_LIMITS.maxNameLength),
    kills: killsSchema,
    stage: bestiaryStageSchema,
  })
  .strict();

export const bestiaryActionFailedMessageSchema = z
  .object({
    type: z.literal("bestiary-action-failed"),
    reason: z.enum(["rate-limited", "unknown-race", "locked", "unavailable"]),
  })
  .strict();

export type BestiaryClass = z.infer<typeof bestiaryClassSchema>;
export type BossCategory = z.infer<typeof bossCategorySchema>;
export type BestiaryCreaturesGetMessage = z.infer<
  typeof bestiaryCreaturesGetMessageSchema
>;
export type BestiaryCreatureEntry = z.infer<typeof bestiaryCreatureEntrySchema>;
export type BestiaryCreaturesStateMessage = z.infer<
  typeof bestiaryCreaturesStateMessageSchema
>;
export type BestiaryMonsterGetMessage = z.infer<
  typeof bestiaryMonsterGetMessageSchema
>;
export type BestiaryLootEntry = z.infer<typeof bestiaryLootEntrySchema>;
export type BestiaryResistance = z.infer<typeof bestiaryResistanceSchema>;
export type BestiaryMonsterStateMessage = z.infer<
  typeof bestiaryMonsterStateMessageSchema
>;
export type BosstiaryGetMessage = z.infer<typeof bosstiaryGetMessageSchema>;
export type BosstiaryEntry = z.infer<typeof bosstiaryEntrySchema>;
export type BosstiaryStateMessage = z.infer<typeof bosstiaryStateMessageSchema>;
export type BosstiaryBossGetMessage = z.infer<
  typeof bosstiaryBossGetMessageSchema
>;
export type BosstiaryBossStateMessage = z.infer<
  typeof bosstiaryBossStateMessageSchema
>;
export type WikiItemSourcesGetMessage = z.infer<
  typeof wikiItemSourcesGetMessageSchema
>;
export type WikiItemSource = z.infer<typeof wikiItemSourceSchema>;
export type WikiItemSourcesStateMessage = z.infer<
  typeof wikiItemSourcesStateMessageSchema
>;
export type BestiaryEntryChangedMessage = z.infer<
  typeof bestiaryEntryChangedMessageSchema
>;
export type BestiaryActionFailedMessage = z.infer<
  typeof bestiaryActionFailedMessageSchema
>;
export type BestiaryActionFailedReason =
  BestiaryActionFailedMessage["reason"];
