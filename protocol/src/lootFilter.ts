import { z } from "zod";

/**
 * How many item types one character may blacklist. Generous enough for a
 * full hunting setup, small enough that the persisted blob stays well under
 * the column's size check and the message under the transport cap.
 */
export const LOOT_FILTER_MAX_ENTRIES = 200;

/** How many distinct carried item types the items reply may list. */
export const LOOT_FILTER_MAX_CARRIED_TYPES = 500;

const itemTypeIdSchema = z.number().int().positive().max(65_535);

/**
 * Per-character auto-loot configuration. It is a blacklist: with `enabled`
 * set, the server sweeps every pickupable item off a corpse the character
 * killed *except* the listed types. Kept deliberately small — the client
 * never sends what to take, only what to skip, and the server re-derives the
 * eligible set from the live corpse inside the tick.
 */
export const lootFilterSchema = z
  .object({
    enabled: z.boolean(),
    ignoredItemTypeIds: z.array(itemTypeIdSchema).max(LOOT_FILTER_MAX_ENTRIES),
  })
  .strict();

export const DEFAULT_LOOT_FILTER = {
  enabled: false,
  ignoredItemTypeIds: [],
} as const satisfies z.infer<typeof lootFilterSchema>;

/**
 * One item type in the loot-filter window. `count` is present for types the
 * character actually carries and absent for a blacklisted type it no longer
 * holds — the window still has to draw those so they can be taken off again.
 */
export const lootFilterItemSchema = z
  .object({
    typeId: itemTypeIdSchema,
    name: z.string().min(1).max(96),
    spriteId: z.number().int().nonnegative(),
    count: z.number().int().positive().optional(),
  })
  .strict();

/**
 * Replaces the stored filter. Sent on a debounced edit from the loot-filter
 * window — at most a couple per second, ~2 KiB at the entry cap.
 */
export const updateLootFilterMessageSchema = z
  .object({
    type: z.literal("update-loot-filter"),
    filter: lootFilterSchema,
  })
  .strict();

/**
 * Asks for the item types the loot-filter window draws. Sent once when the
 * window opens; the server applies a per-session cooldown.
 */
export const lootFilterItemsGetMessageSchema = z
  .object({ type: z.literal("loot-filter-items-get") })
  .strict();

/** Echoes the server-stored filter after an accepted update. */
export const lootFilterUpdatedMessageSchema = z
  .object({
    type: z.literal("loot-filter-updated"),
    filter: lootFilterSchema,
  })
  .strict();

/**
 * What the window draws: every distinct type the character carries, plus the
 * blacklisted types it no longer holds. Both are the player's own data.
 */
export const lootFilterItemsMessageSchema = z
  .object({
    type: z.literal("loot-filter-items"),
    carried: z
      .array(lootFilterItemSchema)
      .max(LOOT_FILTER_MAX_CARRIED_TYPES),
    ignored: z.array(lootFilterItemSchema).max(LOOT_FILTER_MAX_ENTRIES),
  })
  .strict();

export type LootFilter = z.infer<typeof lootFilterSchema>;
export type LootFilterItem = z.infer<typeof lootFilterItemSchema>;
export type UpdateLootFilterMessage = z.infer<
  typeof updateLootFilterMessageSchema
>;
export type LootFilterItemsGetMessage = z.infer<
  typeof lootFilterItemsGetMessageSchema
>;
export type LootFilterUpdatedMessage = z.infer<
  typeof lootFilterUpdatedMessageSchema
>;
export type LootFilterItemsMessage = z.infer<
  typeof lootFilterItemsMessageSchema
>;
