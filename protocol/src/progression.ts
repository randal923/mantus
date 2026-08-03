import { z } from "zod";

export const SKILLS = [
  "fist",
  "club",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
] as const;

/**
 * Not a gameplay cap — a technical one. Every experience path checks
 * `Number.isSafeInteger`, and `getExperienceForLevel` stops producing exact
 * values above level 81,456 (its XP passes `Number.MAX_SAFE_INTEGER`), so the
 * ceiling stays well clear of that.
 */
export const MAX_CHARACTER_LEVEL = 50_000;
export const MAX_MAGIC_LEVEL = 200;
export const MAX_SKILL_LEVEL = 200;
export const MIN_SKILL_LEVEL = 10;
export const MAX_PROGRESSION_VALUE = Number.MAX_SAFE_INTEGER;
/** Stamina is stored in minutes; 2520 minutes = 42 hours (Canary max/start). */
export const MAX_STAMINA_MINUTES = 2_520;

export const skillSchema = z.enum(SKILLS);

export const characterSkillStateSchema = z.object({
  skill: skillSchema,
  level: z.number().int().min(MIN_SKILL_LEVEL).max(MAX_SKILL_LEVEL),
  tries: z.number().int().min(0).max(MAX_PROGRESSION_VALUE),
  triesForNextLevel: z.number().int().min(0).max(MAX_PROGRESSION_VALUE),
  /**
   * Server-computed effective level including Wheel of Destiny conviction
   * boosts and active condition modifiers; display-only (the panel shows it
   * green when it differs from `level`). The server never reads it back.
   */
  boostedLevel: z.number().int().min(0).optional(),
});

export const ownProgressionStateSchema = z.object({
  definitionVersion: z.number().int().positive(),
  level: z.number().int().min(1).max(MAX_CHARACTER_LEVEL),
  experience: z.number().int().min(0).max(MAX_PROGRESSION_VALUE),
  experienceForCurrentLevel: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROGRESSION_VALUE),
  experienceForNextLevel: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROGRESSION_VALUE),
  magicLevel: z.number().int().min(0).max(MAX_MAGIC_LEVEL),
  /** Effective magic level with wheel/condition boosts; display-only. */
  boostedMagicLevel: z.number().int().min(0).optional(),
  manaSpent: z.number().int().min(0).max(MAX_PROGRESSION_VALUE),
  manaSpentForNextMagicLevel: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROGRESSION_VALUE),
  health: z.number().int().nonnegative(),
  maxHealth: z.number().int().positive(),
  mana: z.number().int().nonnegative(),
  maxMana: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
  soul: z.number().int().min(0).max(200),
  maxSoul: z.number().int().min(0).max(200),
  stamina: z.number().int().min(0).max(MAX_STAMINA_MINUTES),
  maxStamina: z.literal(MAX_STAMINA_MINUTES),
  /** Stamina's current effect on experience gain, as a percentage (0/50/100/150). */
  staminaBonusPercent: z.union([
    z.literal(0),
    z.literal(50),
    z.literal(100),
    z.literal(150),
  ]),
  /**
   * Tibia's XP-gain-rate breakdown, computed server-side from the same terms
   * the kill-experience path applies. Purely a display projection: nothing
   * here is read back, and the server's own multipliers remain the real ones
   * (charter rule 8).
   *
   * Per-monster terms — prey bonus, boosted creature, animus mastery — are
   * deliberately absent: they depend on what is being killed, so they cannot
   * be a standing rate.
   */
  experienceRate: z
    .object({
      /** The server's level-staged base rate, as a percentage (500 = x5). */
      basePercent: z.number().int().min(0).max(100_000),
      /** The store/daily XP boost while it is running; 0 otherwise. */
      xpBoostPercent: z.number().int().min(0).max(1_000),
      /** Milliseconds of XP boost left, for the countdown; 0 when inactive. */
      xpBoostRemainingMs: z.number().int().min(0),
      /** Stamina's multiplier, as a percentage (0/50/100/150). */
      staminaPercent: z.number().int().min(0).max(1_000),
      /** All of the above composed, as a percentage. */
      totalPercent: z.number().int().min(0).max(1_000_000),
    })
    .strict(),
  speed: z.number().int().positive(),
  attackSpeedMs: z.number().int().positive(),
  healthRegeneration: z.object({
    amount: z.number().int().positive(),
    intervalMs: z.number().int().positive(),
  }),
  manaRegeneration: z.object({
    amount: z.number().int().positive(),
    intervalMs: z.number().int().positive(),
  }),
  soulRegeneration: z.object({
    amount: z.number().int().positive(),
    intervalMs: z.number().int().positive(),
  }),
  skills: z.array(characterSkillStateSchema).length(SKILLS.length),
});

export type Skill = z.infer<typeof skillSchema>;
export type CharacterSkillState = z.infer<typeof characterSkillStateSchema>;
export type OwnProgressionState = z.infer<typeof ownProgressionStateSchema>;
