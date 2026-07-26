/**
 * The signed delta between a base skill level and the server-computed
 * boosted level (wheel convictions, conditions), or undefined when they
 * match. Display only — the server already applied the real value.
 */
export function formatSkillBoost(
  base: number,
  boosted: number | undefined,
): string | undefined {
  if (boosted === undefined || boosted === base) return undefined;
  const delta = boosted - base;
  return delta > 0 ? `+${delta}` : `${delta}`;
}
