import { BOSSTIARY_MILESTONES, type BossCategory } from "@tibia/protocol";

/** Milestones reached (0..3) and boss points earned for one boss. */
export function getBossMilestones(
  category: BossCategory,
  kills: number,
): { reached: number; points: number } {
  let reached = 0;
  let points = 0;
  for (const milestone of BOSSTIARY_MILESTONES[category]) {
    if (kills < milestone.kills) break;
    reached += 1;
    points += milestone.points;
  }
  return { reached, points };
}
