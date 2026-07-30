import type { ItemType } from "../item/ItemType";

/**
 * Canary `Item::getNameDescription`: a counted plural for stacks, otherwise
 * the article plus the name ("a fire sword", "17 gold coins").
 */
export function itemNameDescription(type: ItemType, count: number): string {
  if (type.stackable && count > 1) {
    return `${count} ${type.plural ?? `${type.name}s`}`;
  }
  return type.article ? `${type.article} ${type.name}` : type.name;
}
