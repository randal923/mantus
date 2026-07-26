import { z } from "zod";

/**
 * Daily boosted creature/boss (Feature 76), transcribed from pinned Canary
 * `game.cpp:770-844` (creature), `io_bosstiary.cpp:22-124` (boss), the exp
 * doubling in `data/events/scripts/player.lua:563-566`, the extra loot roll
 * in `data/scripts/eventcallbacks/monster/ondroploot_boosted.lua`, and the
 * spawn-interval halving in `spawn_monster.cpp:361-369`. Selection and every
 * modifier are server-side; these constants exist so the client can label the
 * boost and the server and tests share one source.
 */
export const BOOSTED_RULES = {
  /** Boosted-creature kill experience is doubled (player.lua:563-566). */
  creatureExperienceMultiplier: 2,
  /** Boosted-creature corpses roll one extra full loot table pass. */
  creatureExtraLootRolls: 1,
  /** Boosted-creature spawn intervals are halved (boostedrate = 2). */
  creatureSpawnIntervalDivisor: 2,
  /** Bosstiary kill-count multiplier for the boosted boss (default 3). */
  bossKillBonus: 3,
  /**
   * Reward-chest loot bonus percent for the boosted boss (default 250, i.e.
   * +2.5 rolls). Applied when Feature 84's reward chests land.
   */
  bossLootBonusPercent: 250,
} as const;

const raceIdSchema = z.number().int().min(1).max(65_535);

const boostedEntrySchema = z
  .object({
    raceId: raceIdSchema,
    name: z.string().min(1).max(100),
    lookTypeId: z.number().int().min(0).max(65_535),
  })
  .strict();

/**
 * Today's boosted pair. Sent on login and again whenever the server rotates
 * the selection at the day boundary; carries only public catalog data.
 */
export const boostedStateMessageSchema = z
  .object({
    type: z.literal("boosted-state"),
    creature: boostedEntrySchema.nullable(),
    boss: boostedEntrySchema.nullable(),
  })
  .strict();

export type BoostedEntry = z.infer<typeof boostedEntrySchema>;
export type BoostedStateMessage = z.infer<typeof boostedStateMessageSchema>;
