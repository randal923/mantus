/**
 * Configurable experience/skill/magic rate stages, ported from Canary's
 * data/stages.lua + getRateFromTable. A stage applies its multiplier while the
 * relevant level is within [minLevel, maxLevel] (maxLevel omitted = unbounded).
 * Rates only scale server-authored awards; they never originate on the client.
 */
export interface StageRow {
  readonly minLevel: number;
  readonly maxLevel?: number;
  readonly multiplier: number;
}

/**
 * Mantus experience stages: fast through the early levels, then a long taper
 * that settles at x2 from level 1001 upwards (the last band is unbounded, so
 * every level past 1000 keeps x2 forever).
 */
export const EXPERIENCE_STAGES: ReadonlyArray<StageRow> = [
  { minLevel: 1, maxLevel: 8, multiplier: 50 },
  { minLevel: 9, maxLevel: 50, multiplier: 80 },
  { minLevel: 51, maxLevel: 100, multiplier: 60 },
  { minLevel: 101, maxLevel: 150, multiplier: 40 },
  { minLevel: 151, maxLevel: 200, multiplier: 30 },
  { minLevel: 201, maxLevel: 300, multiplier: 15 },
  { minLevel: 301, maxLevel: 400, multiplier: 12 },
  { minLevel: 401, maxLevel: 500, multiplier: 10 },
  { minLevel: 501, maxLevel: 600, multiplier: 7 },
  { minLevel: 601, maxLevel: 700, multiplier: 6 },
  { minLevel: 701, maxLevel: 800, multiplier: 5 },
  { minLevel: 801, maxLevel: 900, multiplier: 4 },
  { minLevel: 901, maxLevel: 1000, multiplier: 3 },
  { minLevel: 1001, multiplier: 2 },
];

/** Canary data/stages.lua skillsStages. */
export const SKILL_STAGES: ReadonlyArray<StageRow> = [
  { minLevel: 10, maxLevel: 60, multiplier: 15 },
  { minLevel: 61, maxLevel: 80, multiplier: 10 },
  { minLevel: 81, maxLevel: 110, multiplier: 6 },
  { minLevel: 111, maxLevel: 125, multiplier: 4 },
  { minLevel: 126, multiplier: 2 },
];

/** Canary data/stages.lua magicLevelStages. */
export const MAGIC_STAGES: ReadonlyArray<StageRow> = [
  { minLevel: 0, maxLevel: 60, multiplier: 10 },
  { minLevel: 61, maxLevel: 80, multiplier: 7 },
  { minLevel: 81, maxLevel: 100, multiplier: 5 },
  { minLevel: 101, maxLevel: 110, multiplier: 4 },
  { minLevel: 111, maxLevel: 125, multiplier: 3 },
  { minLevel: 126, multiplier: 2 },
];

/**
 * Resolves the multiplier for `level` from a stage table, falling back to
 * `fallback` when no row matches (Canary getRateFromTable semantics).
 */
export function getStageRate(
  stages: ReadonlyArray<StageRow>,
  level: number,
  fallback: number,
): number {
  if (!Number.isInteger(level) || level < 0) {
    throw new Error("stage level is out of range");
  }
  for (const stage of stages) {
    if (
      level >= stage.minLevel &&
      (stage.maxLevel === undefined || level <= stage.maxLevel)
    ) {
      return stage.multiplier;
    }
  }
  return fallback;
}
