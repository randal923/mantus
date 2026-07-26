import { FORGE_BONUS_THRESHOLDS } from "@tibia/protocol";

/** Canary tools.cpp:1847-1882 — fusion bonus for a uniform(0, 10000) roll. */
export function forgeBonusFor(roll: number): number {
  for (const threshold of FORGE_BONUS_THRESHOLDS) {
    if (roll >= threshold.from && roll <= threshold.to) return threshold.bonus;
  }
  return 0;
}
