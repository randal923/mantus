export interface BossParticipantStats {
  readonly characterId: string;
  /** From the monster's own damage map. */
  readonly damageOut: number;
  /** Damage the boss dealt to this player during the fight. */
  readonly damageIn: number;
  /** Healing this player gave other fight participants. */
  readonly healing: number;
}

export interface BossRewardShare {
  readonly characterId: string;
  readonly score: number;
  readonly lootFactor: number;
  readonly topScore: boolean;
}

/**
 * Canary reward_chest.lua:28-83, including its 0.1 divide-by-zero guards:
 * score is the mean of the three normalized contributions, the crowd
 * penalty divides by cbrt(participants), and over-performance scales by
 * (1 + crowd)^(score/expected). Zero-score entries never join the split.
 */
export function computeBossRewardShares(
  stats: ReadonlyArray<BossParticipantStats>,
): BossRewardShare[] {
  let totalOut = 0.1;
  let totalIn = 0.1;
  let totalHealing = 0.1;
  for (const entry of stats) {
    totalOut += entry.damageOut;
    totalIn += entry.damageIn;
    totalHealing += entry.healing;
  }
  const scored = stats
    .map((entry) => ({
      characterId: entry.characterId,
      score:
        (entry.damageOut / totalOut +
          entry.damageIn / totalIn +
          entry.healing / totalHealing) /
        3,
    }))
    .filter((entry) => entry.score !== 0);
  if (scored.length === 0) return [];
  const expectedScore = 1 / scored.length;
  const crowd = 1 / Math.cbrt(scored.length);
  return scored
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.characterId.localeCompare(right.characterId),
    )
    .map((entry, index) => ({
      characterId: entry.characterId,
      score: entry.score,
      lootFactor: crowd * Math.pow(1 + crowd, entry.score / expectedScore),
      topScore: index === 0,
    }));
}
