import type { Item } from "../item/Item";
import {
  AFFIX_ELEMENTS,
  AFFIX_IDS,
  AFFIX_SKILLS,
  type AffixElement,
  type AffixId,
  type AffixSkill,
  type RolledAffix,
} from "./RolledAffix";

/** Rolled affixes from the item's attribute bag; invalid entries are skipped. */
export function itemAffixesOf(
  item: Pick<Item, "attributes">,
): ReadonlyArray<RolledAffix> {
  const raw = item.attributes.affixes;
  if (!Array.isArray(raw)) return [];
  const affixes: RolledAffix[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { id, value, element, skill } = entry as Record<string, unknown>;
    if (typeof id !== "string") continue;
    if (!(AFFIX_IDS as ReadonlyArray<string>).includes(id)) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      continue;
    }
    if (
      id === "resistance" &&
      !(AFFIX_ELEMENTS as ReadonlyArray<unknown>).includes(element)
    ) {
      continue;
    }
    if (
      id === "skill" &&
      !(AFFIX_SKILLS as ReadonlyArray<unknown>).includes(skill)
    ) {
      continue;
    }
    affixes.push({
      id: id as AffixId,
      value,
      ...(id === "resistance" ? { element: element as AffixElement } : {}),
      ...(id === "skill" ? { skill: skill as AffixSkill } : {}),
    });
  }
  return affixes;
}
