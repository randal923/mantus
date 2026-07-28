/**
 * Compact XP label for the narrow per-level strips, where the full number
 * would not fit: 1_059 → "1.1K", 30_000_000 → "30M".
 */
export function formatProficiencyExperience(
  experience: number,
  language: string,
): string {
  return new Intl.NumberFormat(language, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(experience);
}
