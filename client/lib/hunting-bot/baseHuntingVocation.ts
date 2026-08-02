import type { HuntingVocation } from "../hunt-finder/HuntingPlace";

/**
 * Collapses a promoted vocation name ("Elite Knight", "Elder Druid") onto the
 * base vocation the hunting guides are indexed by.
 */
export function baseHuntingVocation(vocation: string): HuntingVocation {
  if (vocation.includes("Knight")) return "Knight";
  if (vocation.includes("Paladin")) return "Paladin";
  if (vocation.includes("Sorcerer")) return "Sorcerer";
  if (vocation.includes("Druid")) return "Druid";
  return "Monk";
}
