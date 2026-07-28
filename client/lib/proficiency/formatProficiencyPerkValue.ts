import type { ProficiencyPerk } from "./ProficiencyProfile";

/** Families whose value is a fraction (0.02 -> "2%"). */
const PERCENT_PERK_TYPES: ReadonlySet<string> = new Set([
  "critical-hit-chance",
  "elemental-hit-chance",
  "rune-critical-hit-chance",
  "auto-attack-critical-hit-chance",
  "critical-extra-damage",
  "elemental-critical-extra-damage",
  "rune-critical-extra-damage",
  "auto-attack-critical-extra-damage",
  "mana-leech",
  "life-leech",
  "powerful-foe-bonus",
  "bestiary-damage",
  "ranged-hit-chance",
  "armor-penetration",
  "elemental-pierce",
  "alpha-strike-extra-damage",
  "omega-strike-extra-damage",
  "skill-percentage-auto-attack",
  "skill-percentage-spell-damage",
  "skill-percentage-spell-healing",
]);

/** Signed display value for one perk, e.g. "+2%" or "-1". */
export function formatProficiencyPerkValue(perk: ProficiencyPerk): string {
  const asPercent =
    PERCENT_PERK_TYPES.has(perk.type) ||
    (perk.type === "spell-augment" && Math.abs(perk.value) < 1);
  const magnitude = asPercent
    ? Math.round(perk.value * 1_000) / 10
    : perk.value;
  const text = asPercent ? `${magnitude}%` : `${magnitude}`;
  return perk.value >= 0 ? `+${text}` : text;
}
