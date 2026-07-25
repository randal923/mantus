/**
 * The food table from Canary's `data/scripts/spells/support/food.lua`
 * (meat, ham, grape, apple, bread, roll, cheese). Kept as a reviewed literal
 * so the roll is server-side and the item ids can never come from a client.
 */
export const CONJURED_FOOD_TYPE_IDS = [
  3577, 3582, 3592, 3585, 3600, 3601, 3607,
] as const;
