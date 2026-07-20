/**
 * Drop-chance rarity bucket, mirroring Canary's calculateDifficult:
 * chance is per-100000; 0 common .. 4 very rare.
 */
export function getLootRarity(chance: number): number {
  const percent = chance / 1000;
  if (percent < 0.2) return 4;
  if (percent < 1) return 3;
  if (percent < 5) return 2;
  if (percent < 25) return 1;
  return 0;
}
