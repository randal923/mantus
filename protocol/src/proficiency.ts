import { z } from "zod";

/**
 * Weapon proficiency (Feature 82), transcribed from pinned Canary
 * weapon_proficiency.cpp (PR #3845). Accrual happens only on server-side
 * monster deaths for the killer's equipped weapon; the perk tables are
 * pinned content (content/proficiencies.json) and every selection is
 * re-validated against earned progress at execution time.
 */
export const PROFICIENCY_RULES = {
  /** weaponProficiencyGainMultiplier (configmanager.cpp:221). */
  gainMultiplier: 0.33,
  /** Bosstiary-rarity kill experience (weapon_proficiency.cpp:788-800). */
  bossExperience: { bane: 500, archfoe: 5_000, nemesis: 15_000 } as const,
  /**
   * Bestiary-star polynomial values for stars 0..5, precomputed from
   * weapon_proficiency.cpp:802-808 (truncated exactly like the C++ cast).
   */
  starExperience: [1, 30, 70, 100, 165, 240] as const,
  /** Perk-unlock XP thresholds per weapon family (cpp:81-115). */
  experienceTables: {
    crossbow: [600, 8_000, 30_000, 150_000, 650_000, 2_500_000, 10_000_000, 20_000_000, 30_000_000],
    knight: [1_250, 20_000, 80_000, 300_000, 1_500_000, 6_000_000, 20_000_000, 40_000_000, 60_000_000],
    standard: [1_750, 25_000, 100_000, 400_000, 2_000_000, 8_000_000, 30_000_000, 60_000_000, 90_000_000],
  } as const,
  /** Mastery continues two tiers past the last perk level (cpp:44). */
  masteryExperienceOffset: 2,
  maxLevels: 10,
  maxPerksPerLevel: 6,
  maxTrackedWeapons: 64,
  /** One proficiency mutation per session per this window. */
  actionCooldownMs: 300,
} as const;

export const proficiencyGetMessageSchema = z
  .object({ type: z.literal("proficiency-get") })
  .strict();

const proficiencySelectionSchema = z
  .object({
    level: z.number().int().min(0).max(PROFICIENCY_RULES.maxLevels - 1),
    index: z
      .number()
      .int()
      .min(0)
      .max(PROFICIENCY_RULES.maxPerksPerLevel - 1),
  })
  .strict();

/** Full replacement of one weapon's perk picks (Canary 0xB3 action 0x03). */
export const proficiencySelectMessageSchema = z
  .object({
    type: z.literal("proficiency-select"),
    proficiencyId: z.number().int().min(1).max(10_000),
    selections: z
      .array(proficiencySelectionSchema)
      .max(PROFICIENCY_RULES.maxLevels),
  })
  .strict();

const proficiencyWeaponSchema = z
  .object({
    proficiencyId: z.number().int().min(1).max(10_000),
    experience: z.number().int().min(0),
    mastered: z.boolean(),
    /** Levels whose perks may be picked right now. */
    unlockedLevels: z.number().int().min(0).max(PROFICIENCY_RULES.maxLevels),
    /** XP needed for the next unlock; null once mastered. */
    nextLevelExperience: z.number().int().min(0).nullable(),
    selections: z
      .array(proficiencySelectionSchema)
      .max(PROFICIENCY_RULES.maxLevels),
  })
  .strict();

export const proficiencyStateMessageSchema = z
  .object({
    type: z.literal("proficiency-state"),
    weapons: z
      .array(proficiencyWeaponSchema)
      .max(PROFICIENCY_RULES.maxTrackedWeapons),
  })
  .strict();

export const proficiencyActionFailedMessageSchema = z
  .object({
    type: z.literal("proficiency-action-failed"),
    reason: z.enum([
      "unknown-weapon",
      "level-locked",
      "invalid-perk",
      "duplicate-level",
      "rate-limited",
      "invalid-request",
    ]),
  })
  .strict();

/**
 * Animus mastery (Feature 82), Canary animus_mastery.cpp: a flat exp bonus
 * on kills of mastered races — +2% plus +0.1% per ten masteries, capped at
 * x4 total. The earn path (Soul Pit soul cores) is deferred; grants come
 * from server-side systems only.
 */
export const ANIMUS_RULES = {
  baseBonusPercent: 2,
  perTenBonusPercent: 0.1,
  maxMultiplier: 4,
  monstersPerStep: 10,
} as const;

export const animusStateMessageSchema = z
  .object({
    type: z.literal("animus-state"),
    raceIds: z.array(z.number().int().min(1).max(65_535)).max(2_048),
    /** Current bonus in tenths of a percent (+2.0% -> 20), like Canary. */
    bonusTenthsPercent: z.number().int().min(0).max(3_000),
  })
  .strict();

export type ProficiencyGetMessage = z.infer<typeof proficiencyGetMessageSchema>;
export type ProficiencySelection = z.infer<typeof proficiencySelectionSchema>;
export type ProficiencySelectMessage = z.infer<
  typeof proficiencySelectMessageSchema
>;
export type ProficiencyWeaponState = z.infer<typeof proficiencyWeaponSchema>;
export type ProficiencyStateMessage = z.infer<
  typeof proficiencyStateMessageSchema
>;
export type ProficiencyActionFailedMessage = z.infer<
  typeof proficiencyActionFailedMessageSchema
>;
export type ProficiencyActionFailedReason =
  ProficiencyActionFailedMessage["reason"];
export type AnimusStateMessage = z.infer<typeof animusStateMessageSchema>;
