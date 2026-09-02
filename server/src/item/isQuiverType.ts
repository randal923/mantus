import type { ItemType } from "./ItemType";

/**
 * Canary `ItemType::isQuiver`: the quiver container that dresses the shield
 * hand next to a bow or crossbow and feeds it ammunition.
 */
export function isQuiverType(type: ItemType): boolean {
  return type.primaryType === "quivers";
}
