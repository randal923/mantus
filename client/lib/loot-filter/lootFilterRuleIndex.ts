import type { LootFilter, LootFilterRule } from "@tibia/protocol";

/** The pick-up list keyed by item type, for per-cell selection checks. */
export function lootFilterRuleIndex(
  filter: LootFilter,
): ReadonlyMap<number, LootFilterRule> {
  return new Map(filter.pickupRules.map((rule) => [rule.typeId, rule]));
}
