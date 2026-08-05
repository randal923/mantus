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
 * There is no gameplay level cap, exactly as in Canary — its `level` is a
 * plain `uint32_t` and its `experience` a `uint64_t`, with no constant and no
 * database CHECK bounding either.
 *
 * This is the storage ceiling and nothing more: 821009 is the highest level
 * whose required experience still fits in the signed 64-bit column that holds
 * it, the same wall Canary's `uint64_t` runs into. It exists so schemas and
 * command input have *a* bound; it is never a rule about how far a character
 * may progress. Experience is carried as `bigint` end to end and serialised as
 * a decimal string, so nothing loses precision on the way there.
 */
export const MAX_STORABLE_CHARACTER_LEVEL = 821_009;

/** A non-negative integer too large for `number`, e.g. experience. */
export const bigintStringSchema = z.string().regex(/^\d+$/);
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
   * Server-computed effective level including equipped gear, Wheel of Destiny
   * conviction boosts and active condition modifiers; display-only (the panel
   * shows it green when it differs from `level`). The server never reads it
   * back. This is the value the combat formulas actually use.
   */
  boostedLevel: z.number().int().min(0).optional(),
  /**
   * The part of `boostedLevel` contributed by equipped items and their running
   * imbuements, so the panel can break the total down. Display only.
   */
  equipmentBonus: z.number().int().optional(),
});

/**
 * What equipped gear (items plus their running imbuements) contributes to the
 * character panel's detail stats, so a hover can show base + equipment.
 * Display only — the server already applied every one of these.
 */
export const equipmentStatBonusesSchema = z
  .object({
    magicLevel: z.number().int(),
    maxHealth: z.number().int(),
    maxMana: z.number().int(),
    capacity: z.number().int(),
    speed: z.number().int(),
    attackSpeedMs: z.number().int(),
  })
  .strict();

/**
 * Live combat totals for the Character Details panel: gear + running
 * imbuements + rarity affixes + wheel, matching what the combat formulas
 * read. Display only, like every other bonus block.
 */
export const equipmentCombatStatsSchema = z
  .object({
    criticalChancePercent: z.number().min(0).max(1_000),
    criticalDamagePercent: z.number().min(0).max(1_000),
    lifeLeechPercent: z.number().min(0).max(1_000),
    manaLeechPercent: z.number().min(0).max(1_000),
    resistances: z
      .array(
        z
          .object({
            element: z.string().min(1).max(20),
            percent: z.number().min(-1_000).max(100),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();

export const ownProgressionStateSchema = z.object({
  definitionVersion: z.number().int().positive(),
  level: z.number().int().min(1).max(MAX_STORABLE_CHARACTER_LEVEL),
  // Decimal strings: past level ~81k these exceed Number.MAX_SAFE_INTEGER, and
  // JSON has no bigint. The client parses them back with BigInt.
  experience: bigintStringSchema,
  experienceForCurrentLevel: bigintStringSchema,
  experienceForNextLevel: bigintStringSchema,
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
  equipmentBonuses: equipmentStatBonusesSchema,
  /** Optional so older payloads stay valid; the server always sends it. */
  combat: equipmentCombatStatsSchema.optional(),
});

export type Skill = z.infer<typeof skillSchema>;
export type CharacterSkillState = z.infer<typeof characterSkillStateSchema>;
export type EquipmentStatBonuses = z.infer<typeof equipmentStatBonusesSchema>;
export type EquipmentCombatStats = z.infer<typeof equipmentCombatStatsSchema>;
export type OwnProgressionState = z.infer<typeof ownProgressionStateSchema>;
