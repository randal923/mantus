import type { ItemDisplayRarity, LootFilterRule } from "@tibia/protocol";

/**
 * Whether the pick-up list asks for this drop. A rule without grades takes
 * every grade of its type; a rule with grades takes only those, and never an
 * item whose type has no grade at all — a stale grade list must not widen
 * what the sweep takes.
 */
export function lootFilterTakes(
  rules: ReadonlyArray<LootFilterRule>,
  typeId: number,
  rarity: ItemDisplayRarity | undefined,
): boolean {
  return rules.some((rule) => {
    if (rule.typeId !== typeId) return false;
    if (!rule.rarities) return true;
    return rarity !== undefined && rule.rarities.includes(rarity);
  });
}
