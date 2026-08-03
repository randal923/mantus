/**
 * Canary's Player::calculateFlatDamageHealing (player.cpp:578): the level
 * baseline monk formulas add on top of the skill roll. Scaling slows through
 * successive level tiers (500, 1100, 1800, ...).
 */
export function flatDamageHealing(level: number): number {
  let previousTiersBaseline = 0;
  let currentTierBaseline = 0;
  let currentTierFactor = 1 / 5;
  let threshold = 500;
  let thresholdStep = 600;
  let tierIndex = 1;
  while (level >= threshold) {
    currentTierBaseline = threshold;
    currentTierFactor = 1 / (5 + tierIndex);
    previousTiersBaseline += threshold * (1 / (5 + tierIndex - 1));
    tierIndex += 1;
    threshold += thresholdStep;
    thresholdStep += 100;
  }
  return Math.min(
    Math.ceil(
      previousTiersBaseline + (level - currentTierBaseline) * currentTierFactor,
    ),
    65_535,
  );
}
