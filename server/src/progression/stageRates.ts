/**
 * Configurable experience/skill/magic rate stages, ported from Canary's
 * data/stages.lua + getRateFromTable. A stage applies its multiplier while the
 * relevant level is within [minLevel, maxLevel] (maxLevel omitted = unbounded).
 * The tables are authored in config.yml under `progression.stages` and loaded
 * by loadServerConfig; rates only scale server-authored awards, and they never
 * originate on the client.
 */
export interface StageRow {
  readonly minLevel: number;
  readonly maxLevel?: number;
  readonly multiplier: number;
}

/** The three stage tables the server applies, as loaded from config.yml. */
export interface StageTables {
  readonly experience: ReadonlyArray<StageRow>;
  readonly skill: ReadonlyArray<StageRow>;
  readonly magic: ReadonlyArray<StageRow>;
}

/**
 * Stages switched off (`progression.stages.enabled: false`): every lookup
 * misses and falls back to the flat `rates.*` multiplier.
 */
export const NO_STAGES: StageTables = {
  experience: [],
  skill: [],
  magic: [],
};

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
