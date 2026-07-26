/**
 * Canary reward_chest.lua:85-103: one base roll plus the bosstiary slot
 * bonus (or the boosted-boss bonus) as extra rolls; the fractional part is
 * a probabilistic extra roll (chance = fraction).
 */
export function bossRewardRollCount(
  bonusPercent: number,
  chance: (percent: number) => boolean,
): number {
  const rolls = 1 + Math.max(0, bonusPercent) / 100;
  const fraction = rolls % 1;
  if (fraction === 0) return rolls;
  return chance(fraction * 100) ? Math.ceil(rolls) : Math.floor(rolls);
}
