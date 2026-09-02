import type { ItemType } from "../ItemType";
import { isQuiverType } from "../isQuiverType";

/**
 * Canary `Container::queryAdd`: a quiver takes ammunition and nothing else
 * (RETURNVALUE_ONLYAMMOINQUIVER); every other container takes any item.
 */
export function containerAcceptsItemType(
  container: ItemType,
  item: ItemType,
): boolean {
  return !isQuiverType(container) || item.weaponType === "ammunition";
}
