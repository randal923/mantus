/**
 * Account-wide bonuses granted while premium time is running. Lives in the
 * protocol so the game server (the enforcer) and the public site (the
 * advertiser) read the same numbers. Every bonus is applied server-side at
 * execution time against `player.isPremiumAt(now)`; nothing here is ever
 * read back from a client.
 */
export const PREMIUM_BENEFITS = {
  /** Extra flat regeneration on top of the vocation table. */
  regeneration: { intervalMs: 3_000, healthAmount: 10, manaAmount: 20 },
  /** Multiplier on hunt (kill) experience. */
  experienceMultiplier: 1.1,
  /** Additive critical hit chance, in percent points. */
  criticalChancePercent: 3,
  /** Multiplier on exercise-weapon training pace. */
  exerciseSpeedMultiplier: 1.1,
  /** Multiplier on weapon-proficiency experience. */
  proficiencyExperienceMultiplier: 1.1,
  /** Multiplier on the Gift of Life and avatar-spell cooldowns. */
  wheelCooldownMultiplier: 0.7,
} as const;
