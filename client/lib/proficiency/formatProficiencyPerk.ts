import type { TFunction } from "i18next";
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

function formatPerkValue(perk: ProficiencyPerk): string {
  const asPercent =
    PERCENT_PERK_TYPES.has(perk.type) ||
    (perk.type === "spell-augment" && Math.abs(perk.value) < 1);
  const magnitude = asPercent
    ? Math.round(perk.value * 1_000) / 10
    : perk.value;
  const text = asPercent ? `${magnitude}%` : `${magnitude}`;
  return perk.value >= 0 ? `+${text}` : text;
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/**
 * Display-only short label for one perk-table entry. Known families get a
 * localized template; unknown/inert families fall back to a generic label
 * derived from the slug. The server applies the real effects either way.
 */
export function formatProficiencyPerk(
  perk: ProficiencyPerk,
  t: TFunction,
): string {
  const value = formatPerkValue(perk);
  return t(`proficiency.perks.${perk.type}`, {
    defaultValue: t("proficiency.perks.generic", {
      label: humanizeSlug(perk.type),
      value,
    }),
    value,
    skill: perk.skill
      ? t(`skills.${perk.skill}`, { defaultValue: humanizeSlug(perk.skill) })
      : "",
    name: perk.bestiaryName ?? "",
    range: perk.range ?? "",
  });
}
