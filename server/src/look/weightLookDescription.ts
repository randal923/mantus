import type { ItemType } from "../item/ItemType";

/** Canary stores weight in hundredths of an ounce; the look line shows oz. */
function formatOunces(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

/**
 * Canary `Item::getWeightDescription`, only ever reached for pickupable items
 * the looker is standing next to.
 */
export function weightLookDescription(type: ItemType, count: number): string {
  const plural = type.stackable && count > 1;
  const weight = type.weight * (plural ? count : 1);
  return `${plural ? "They weigh" : "It weighs"} ${formatOunces(weight)} oz.`;
}
