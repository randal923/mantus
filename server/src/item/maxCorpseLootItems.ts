/**
 * Hard ceiling on the drops one corpse can hold. A corpse grows to the size
 * of its loot (Canary adds every rolled drop with FLAG_NOLIMIT, so a table
 * longer than the corpse's slot count still drops in full); the `items`
 * table's `items_location_slot_bounds` check caps corpse slots at 0..99.
 */
export const MAX_CORPSE_LOOT_ITEMS = 100;
