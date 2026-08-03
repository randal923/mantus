import { getExperienceForLevel } from "./getExperienceForLevel";

/**
 * The level a given experience total buys. There is no level cap to search up
 * to, so the upper bound is found by doubling first and only then bisected —
 * the cost is logarithmic in the level either way.
 */
export function getLevelForExperience(experience: bigint): number {
  if (experience < 0n) {
    throw new Error("experience is out of range");
  }
  let low = 1;
  let high = 2;
  while (getExperienceForLevel(high) <= experience) {
    low = high;
    high *= 2;
  }
  // `high` now costs more than we have, so the answer is at most `high - 1`.
  high -= 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (getExperienceForLevel(middle) <= experience) low = middle;
    else high = middle - 1;
  }
  return low;
}
