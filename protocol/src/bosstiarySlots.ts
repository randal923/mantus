import { z } from "zod";

/**
 * Bosstiary boss slots (Feature 76), transcribed from pinned Canary
 * `io_bosstiary.cpp:217-308` (loot-bonus and removal-price curves),
 * `protocolgame.cpp:11186-11232` (slot unlocks, the boosted third slot), and
 * `game.cpp:11219-11244` (removal charging). The loot bonus itself is
 * consumed by Feature 84's reward-chest rolls; until then it is display.
 */
export const BOSS_SLOT_RULES = {
  slotCount: 2,
  /** Slot one unlocks with the first boss at Prowess (any category). */
  slotTwoUnlockPoints: 1_500,
  /** Extra loot-bonus percent while the slotted boss is at Mastery. */
  masteryLootBonus: 25,
  /** The boosted boss occupies a free third slot while it is boosted. */
  boostedSlotActive: true,
  /** removals 0 and 1 are free; then 300000 * n - 500000 gold. */
  removeBasePrice: 300_000,
  removePriceOffset: 500_000,
} as const;

/**
 * Canary io_bosstiary.cpp:217-227 — loot bonus percent from boss points.
 * Shared so client display, server grants, and tests agree exactly.
 */
export function bossPointsLootBonus(bossPoints: number): number {
  if (bossPoints <= 250) return Math.trunc(25 + bossPoints / 10);
  if (bossPoints < 1_250) return Math.trunc(37.5 + bossPoints / 20);
  return Math.trunc(
    100 + 0.5 * (Math.sqrt(8 * ((bossPoints - 1_250) / 5) + 81) - 9),
  );
}

/** Canary io_bosstiary.cpp:303-308 — gold price of the next slot removal. */
export function bossSlotRemovePrice(removeTimes: number): number {
  if (removeTimes < 2) return 0;
  return (
    BOSS_SLOT_RULES.removeBasePrice * removeTimes -
    BOSS_SLOT_RULES.removePriceOffset
  );
}

const raceIdSchema = z.number().int().min(1).max(65_535);
const slotIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(BOSS_SLOT_RULES.slotCount - 1);

export const bossSlotsGetMessageSchema = z
  .object({ type: z.literal("boss-slots-get") })
  .strict();

/** Assign (raceId) or clear (null) one slot; the server re-validates all. */
export const bossSlotSetMessageSchema = z
  .object({
    type: z.literal("boss-slot-set"),
    slot: slotIndexSchema,
    raceId: raceIdSchema.nullable(),
  })
  .strict();

const bossSlotEntrySchema = z
  .object({
    slot: slotIndexSchema,
    raceId: raceIdSchema.nullable(),
    kills: z.number().int().min(0).max(4_294_967_295),
    /** Slot loot bonus percent including the mastery extra. */
    lootBonusPercent: z.number().int().min(0).max(1_000),
    /** True while the slotted boss is today's boosted boss (slot idles). */
    inactive: z.boolean(),
  })
  .strict();

export const bossSlotsStateMessageSchema = z
  .object({
    type: z.literal("boss-slots-state"),
    slotOneUnlocked: z.boolean(),
    slotTwoUnlocked: z.boolean(),
    bossPoints: z.number().int().min(0).max(1_000_000),
    slots: z.array(bossSlotEntrySchema).length(BOSS_SLOT_RULES.slotCount),
    /** Gold price of the next removal (0 while removals are free). */
    nextRemovePriceGold: z.number().int().min(0),
    /** Races at Prowess or better — the only assignable bosses. */
    unlockedRaceIds: z.array(raceIdSchema).max(256),
    boosted: z
      .object({
        raceId: raceIdSchema,
        kills: z.number().int().min(0).max(4_294_967_295),
        killBonus: z.number().int().min(1).max(100),
        lootBonusPercent: z.number().int().min(0).max(1_000),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const bossSlotFailedMessageSchema = z
  .object({
    type: z.literal("boss-slot-failed"),
    reason: z.enum([
      "slot-locked",
      "not-unlocked",
      "already-slotted",
      "boosted-boss",
      "insufficient-gold",
      "invalid-request",
      "rate-limited",
    ]),
  })
  .strict();

export type BossSlotsGetMessage = z.infer<typeof bossSlotsGetMessageSchema>;
export type BossSlotSetMessage = z.infer<typeof bossSlotSetMessageSchema>;
export type BossSlotEntry = z.infer<typeof bossSlotEntrySchema>;
export type BossSlotsStateMessage = z.infer<typeof bossSlotsStateMessageSchema>;
export type BossSlotFailedMessage = z.infer<typeof bossSlotFailedMessageSchema>;
export type BossSlotFailedReason = BossSlotFailedMessage["reason"];
