import { PORTABLE_SELLER_TYPE_ID } from "@tibia/protocol";
import { ADVENTURERS_STONE_TYPE_ID } from "./adventurersStoneTypeId";
import { ITEM_POUCH_TYPE_ID } from "./itemPouchTypeId";

/**
 * The only item types a player may place into the bound container. Entry is a
 * one-way door: once a direct child of the bound root, an item is
 * character-bound and never leaves it.
 */
export const BOUND_ITEM_TYPE_IDS: ReadonlySet<number> = new Set([
  ITEM_POUCH_TYPE_ID,
  PORTABLE_SELLER_TYPE_ID,
  ADVENTURERS_STONE_TYPE_ID,
]);
