import { PROFICIENCY_RULES, type ProficiencyWeaponState } from "@tibia/protocol";

export interface ProficiencyLevelProgress {
  /** 0–100 XP fill toward this level. */
  readonly percent: number;
  /** Total weapon XP the level needs, or null when the table is unknown. */
  readonly required: number | null;
  /** XP still missing for this level; 0 once reached, null when unknown. */
  readonly remaining: number | null;
}

export interface ProficiencyLevelPercents {
  /** One entry per perk level (index-aligned with the profile's levels). */
  readonly perLevel: ReadonlyArray<ProficiencyLevelProgress>;
  /** 0–100 fill of the whole-table progress bar. */
  readonly overall: number;
}

/**
 * Display-only per-level XP progress, like the Tibia window's column/star
 * bars. The wire state carries only total XP, unlocked levels, and the next
 * threshold, so the weapon's XP family is recovered by matching that
 * threshold against the shared PROFICIENCY_RULES tables; when no family
 * matches (or the weapon is mastered) locked levels simply show 0 or 100.
 * The server remains the authority on what is actually unlocked.
 */
export function getProficiencyLevelPercents(
  weapon: ProficiencyWeaponState,
  levelCount: number,
): ProficiencyLevelPercents {
  const table = Object.values(PROFICIENCY_RULES.experienceTables).find(
    (thresholds) =>
      weapon.nextLevelExperience !== null &&
      thresholds[weapon.unlockedLevels] === weapon.nextLevelExperience,
  );
  const perLevel: ProficiencyLevelProgress[] = [];
  for (let index = 0; index < levelCount; index += 1) {
    const threshold = table?.[index] ?? null;
    if (index < weapon.unlockedLevels) {
      perLevel.push({ percent: 100, required: threshold, remaining: 0 });
      continue;
    }
    if (threshold === null || threshold <= 0) {
      perLevel.push({ percent: 0, required: null, remaining: null });
      continue;
    }
    perLevel.push({
      percent: Math.max(0, Math.min(100, (weapon.experience / threshold) * 100)),
      required: threshold,
      remaining: Math.max(0, threshold - weapon.experience),
    });
  }
  const overall =
    levelCount === 0
      ? 0
      : perLevel.reduce((sum, level) => sum + level.percent, 0) / levelCount;
  return { perLevel, overall };
}
