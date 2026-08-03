import type { PublicServerInfoData } from "@tibia/protocol";
import type { StageRow, StageTables } from "./stageRates";

/**
 * The stage tables the public site advertises. Purely descriptive: it mirrors
 * the tables the server already applies, and reports empty lists while the
 * server runs the flat rates instead, so the site never claims a curve that is
 * not in effect (charter rule 8).
 */
export function publicStageRates(
  stages: StageTables,
): PublicServerInfoData["stages"] {
  const rows = (table: ReadonlyArray<StageRow>) =>
    table.map((stage) => ({
      minLevel: stage.minLevel,
      maxLevel: stage.maxLevel ?? null,
      multiplier: stage.multiplier,
    }));
  return {
    experience: rows(stages.experience),
    skill: rows(stages.skill),
    magic: rows(stages.magic),
  };
}
