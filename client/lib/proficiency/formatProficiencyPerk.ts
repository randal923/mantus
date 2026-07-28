import type { TFunction } from "i18next";
import { formatProficiencyPerkValue } from "./formatProficiencyPerkValue";
import type { ProficiencyPerk } from "./ProficiencyProfile";

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
  const value = formatProficiencyPerkValue(perk);
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
