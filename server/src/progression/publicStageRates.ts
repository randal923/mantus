import type { PublicServerInfoData } from "@tibia/protocol";
import {
  EXPERIENCE_STAGES,
  MAGIC_STAGES,
  SKILL_STAGES,
  type StageRow,
} from "./stageRates";

/**
 * The stage tables the public site advertises. Purely descriptive: it mirrors
 * the tables the server already applies, and reports empty lists while the
 * server runs the flat rates instead, so the site never claims a curve that is
 * not in effect (charter rule 8).
 */
export function publicStageRates(
  useStages: boolean,
): PublicServerInfoData["stages"] {
  const rows = (stages: ReadonlyArray<StageRow>) =>
    useStages
      ? stages.map((stage) => ({
          minLevel: stage.minLevel,
          maxLevel: stage.maxLevel ?? null,
          multiplier: stage.multiplier,
        }))
      : [];
  return {
    experience: rows(EXPERIENCE_STAGES),
    skill: rows(SKILL_STAGES),
    magic: rows(MAGIC_STAGES),
  };
}
