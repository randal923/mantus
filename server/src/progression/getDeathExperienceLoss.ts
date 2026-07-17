/**
 * Pinned death penalty (v1): a player loses 10% of total experience,
 * rounded down. Blessings, unfair-fight/PVP reduction, skill loss, and
 * item loss are not implemented yet; the deferred rules are tracked in
 * todo/08b-player-death.md.
 */
export function getDeathExperienceLoss(experience: number): number {
  if (!Number.isSafeInteger(experience) || experience < 0) {
    throw new Error("experience is out of range");
  }
  return Math.floor(experience / 10);
}
