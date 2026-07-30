import type { ItemType } from "../item/ItemType";
import { VOCATION_DEFINITIONS } from "../progression/vocationDefinitions";

/**
 * Canary builds an item's `vocationString` from the *base* vocations only —
 * the promoted variants are registered for the requirement check but hidden
 * from the description ("sorcerers and druids", never "sorcerers, master
 * sorcerers and ...").
 */
function vocationString(vocations: ReadonlyArray<string>): string {
  const names = vocations.filter((vocation) => {
    const definition =
      VOCATION_DEFINITIONS[vocation as keyof typeof VOCATION_DEFINITIONS];
    return definition?.promotedFrom === null;
  });
  if (names.length === 0) return "players";
  const plurals = names.map((name) => `${name.toLowerCase()}s`);
  if (plurals.length === 1) return plurals[0] as string;
  return `${plurals.slice(0, -1).join(", ")} and ${plurals.at(-1) as string}`;
}

/**
 * Canary's `wieldInfo` line, or null when the type carries no requirement.
 * We have no premium or magic-level item requirements to report.
 */
export function itemWieldInfo(type: ItemType): string | null {
  const requirements = type.requirements;
  if (!requirements?.level && !requirements?.vocations?.length) return null;
  const who = requirements.vocations
    ? vocationString(requirements.vocations)
    : "players";
  const level = requirements.level
    ? ` of level ${requirements.level} or higher`
    : "";
  return `It can only be wielded properly by ${who}${level}.`;
}
