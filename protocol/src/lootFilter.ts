import { z } from "zod";
import { itemDisplayRaritySchema, itemTooltipSchema } from "./item";

/**
 * How many item types one character may list. Generous enough for a full
 * hunting setup, small enough that the persisted blob stays under the
 * column's size check and a full list stays under the transport cap even
 * when every entry names all five grades.
 */
export const LOOT_FILTER_MAX_ENTRIES = 200;

/**
 * How many distinct carried item types the items reply may list. Each entry
 * carries a server-composed tooltip, so this also bounds that message.
 */
export const LOOT_FILTER_MAX_CARRIED_TYPES = 250;

const itemTypeIdSchema = z.number().int().positive().max(65_535);

/**
 * One line of the pick-up list: an item type, optionally narrowed to the
 * rarity grades the player wants. Absent `rarities` means every grade —
 * which is also the only sensible reading for items that cannot roll one
 * (gold, potions, stackables).
 */
export const lootFilterRuleSchema = z
  .object({
    typeId: itemTypeIdSchema,
    rarities: z.array(itemDisplayRaritySchema).min(1).max(5).optional(),
  })
  .strict();

/**
 * Per-character auto-loot configuration. It is a whitelist: with `enabled`
 * set, the server sweeps a corpse the character killed and takes only the
 * listed types, and only in the listed grades. The client never sends what an
 * item *is* — the server re-derives every type and grade from the live corpse
 * inside the tick and treats the list as a request, not a fact.
 */
export const lootFilterSchema = z
  .object({
    enabled: z.boolean(),
    pickupRules: z.array(lootFilterRuleSchema).max(LOOT_FILTER_MAX_ENTRIES),
  })
  .strict();

export const DEFAULT_LOOT_FILTER = {
  enabled: false,
  pickupRules: [],
} as const satisfies z.infer<typeof lootFilterSchema>;

/**
 * One cell of the loot-filter window. `count` is present on the carried
 * listing and absent from the type listing. The tooltip is composed by the
 * server from its own catalog, exactly as an inventory item's is, and its
 * `rarity` is the grade the cell stands for — the grade a carried stack
 * actually rolled, or none at all for a type that never rolls one.
 */
export const lootFilterItemSchema = z
  .object({
    typeId: itemTypeIdSchema,
    name: z.string().min(1).max(96),
    spriteId: z.number().int().nonnegative(),
    count: z.number().int().positive().optional(),
    tooltip: itemTooltipSchema,
  })
  .strict();

/**
 * Replaces the stored filter. Sent on a debounced edit from the loot-filter
 * window — at most a couple per second.
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
 * What the window draws, in two shapes of the same data. `carried` is what
 * the character is actually holding, split by rolled grade so a legendary
 * sword in the bag draws as a legendary sword. `types` is one entry per
 * distinct type it carries or lists, ungraded — that is what the search pane
 * expands into grade cells and what the pick-up list reads its names from.
 * Both are the player's own data.
 */
export const lootFilterItemsMessageSchema = z
  .object({
    type: z.literal("loot-filter-items"),
    carried: z.array(lootFilterItemSchema).max(LOOT_FILTER_MAX_CARRIED_TYPES),
    types: z
      .array(lootFilterItemSchema)
      .max(LOOT_FILTER_MAX_CARRIED_TYPES + LOOT_FILTER_MAX_ENTRIES),
  })
  .strict();

export type LootFilterRule = z.infer<typeof lootFilterRuleSchema>;
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
