import type { AchievementEntry } from "@tibia/protocol";

export interface ProfileProgressSummary {
  readonly grantedCount: number;
  readonly totalCount: number;
  readonly grantedPoints: number;
  readonly totalPoints: number;
  /** Ungranted secret achievements, shown only as "???" rows. */
  readonly hiddenCount: number;
}

/** Aggregates the own profile-state catalog into header progress numbers. */
export function summarizeProfileProgress(
  achievements: ReadonlyArray<AchievementEntry>,
): ProfileProgressSummary {
  let grantedCount = 0;
  let grantedPoints = 0;
  let totalPoints = 0;
  let hiddenCount = 0;
  for (const achievement of achievements) {
    totalPoints += achievement.points;
    if (achievement.granted) {
      grantedCount += 1;
      grantedPoints += achievement.points;
      continue;
    }
    if (achievement.secret) hiddenCount += 1;
  }
  return {
    grantedCount,
    totalCount: achievements.length,
    grantedPoints,
    totalPoints,
    hiddenCount,
  };
}
