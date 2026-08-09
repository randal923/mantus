import { PORTABLE_SELLER_TYPE_ID } from "@tibia/protocol";

/** The Loot Pouch; every character owns exactly one, inside the bound root. */
const LOOT_POUCH_TYPE_ID = 23_721;

/**
 * The only item types the server accepts as direct children of the bound
 * container — mirrors the server's own allowlist so the client can pre-reject
 * hopeless moves.
 */
export const BOUND_ITEM_TYPE_IDS: ReadonlySet<number> = new Set([
  LOOT_POUCH_TYPE_ID,
  PORTABLE_SELLER_TYPE_ID,
]);
