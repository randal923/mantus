import type { WikiAffixGuideEntry } from "./wikiAffixGuide";

function scaleAffixValue(value: number, multiplier: number): number {
  return Math.max(1, Math.round(value * multiplier));
}

/**
 * Roll range of one affix at a grade's multiplier, using the server's
 * rounding from `rollItemAffixes` (`max(1, round(value × multiplier))`).
 */
export function formatAffixRange(
  entry: WikiAffixGuideEntry,
  multiplier: number,
): string {
  const low = scaleAffixValue(entry.minimum, multiplier);
  const high = scaleAffixValue(entry.maximum, multiplier);
  const suffix = entry.percent ? "%" : "";
  if (low === high) return `+${low}${suffix}`;
  return `+${low}–${high}${suffix}`;
}
