import {
  ITEM_DISPLAY_RARITIES,
  LOOT_FILTER_MAX_ENTRIES,
  type ItemDisplayRarity,
  type LootFilter,
  type LootFilterRule,
} from "@tibia/protocol";

function withoutType(filter: LootFilter, typeId: number): LootFilter {
  return {
    ...filter,
    pickupRules: filter.pickupRules.filter((rule) => rule.typeId !== typeId),
  };
}

function replaceRule(filter: LootFilter, next: LootFilterRule): LootFilter {
  return {
    ...filter,
    pickupRules: filter.pickupRules.map((rule) =>
      rule.typeId === next.typeId ? next : rule,
    ),
  };
}

function appendRule(filter: LootFilter, next: LootFilterRule): LootFilter {
  // At the cap the edit is dropped rather than silently trimmed server-side,
  // so what the window shows and what the server stores stay the same list.
  if (filter.pickupRules.length >= LOOT_FILTER_MAX_ENTRIES) return filter;
  return { ...filter, pickupRules: [...filter.pickupRules, next] };
}

function normalize(
  typeId: number,
  grades: ReadonlyArray<ItemDisplayRarity>,
): LootFilterRule | null {
  if (grades.length === 0) return null;
  // Every grade selected is the same request as "this type", and the shorter
  // form is what a type that cannot roll a grade would have stored anyway.
  if (grades.length === ITEM_DISPLAY_RARITIES.length) return { typeId };
  return { typeId, rarities: [...grades] };
}

/**
 * Adds or removes one cell from the pick-up list. Passing a grade toggles
 * just that grade; passing none toggles the whole type, which is what a cell
 * for an item that never rolls a grade — gold, potions, a stack of bolts —
 * can mean.
 */
export function toggleLootFilterRule(
  filter: LootFilter,
  typeId: number,
  rarity?: ItemDisplayRarity,
): LootFilter {
  const current = filter.pickupRules.find((rule) => rule.typeId === typeId);
  if (!rarity) {
    return current
      ? withoutType(filter, typeId)
      : appendRule(filter, { typeId });
  }
  if (!current) return appendRule(filter, { typeId, rarities: [rarity] });
  const grades = current.rarities ?? ITEM_DISPLAY_RARITIES;
  const next = normalize(
    typeId,
    grades.includes(rarity)
      ? grades.filter((grade) => grade !== rarity)
      : ITEM_DISPLAY_RARITIES.filter(
          (grade) => grade === rarity || grades.includes(grade),
        ),
  );
  return next ? replaceRule(filter, next) : withoutType(filter, typeId);
}
