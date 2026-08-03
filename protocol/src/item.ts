import { z } from "zod";

export const EQUIPMENT_SLOTS = [
  "helmet",
  "amulet",
  "backpack",
  "armor",
  "weapon",
  "shield",
  "legs",
  "boots",
  "ring",
  "ammo",
] as const;

export const equipmentSlotSchema = z.enum(EQUIPMENT_SLOTS);

/**
 * Quick-loot buckets, Canary's `ObjectCategory` reduced to what this server
 * distinguishes. The server derives an item's bucket from its own catalog;
 * a client may name one to filter a sweep, never to change what an item is.
 * `none` is server-only — it marks loot quick loot never takes.
 */
export const QUICK_LOOT_CATEGORIES = [
  "none",
  "gold",
  "valuable",
  "weapon",
  "equipment",
  "ammunition",
  "container",
  "rune",
  "food",
  "other",
] as const;

export const quickLootCategorySchema = z.enum(QUICK_LOOT_CATEGORIES);

/** The buckets a client may ask a quick-loot sweep to restrict itself to. */
export const quickLootFilterSchema = quickLootCategorySchema.exclude(["none"]);

export const itemAffixSchema = z
  .object({
    text: z.string().min(1).max(200),
  })
  .strict();

/** Display data composed from the pinned server catalog, never client stats. */
export const itemTooltipSchema = z
  .object({
    name: z.string().min(1).max(120),
    typeLine: z.string().min(1).max(80),
    spriteId: z.number().int().positive(),
    primaryStat: z.string().min(1).max(100).optional(),
    affixes: z.array(itemAffixSchema).max(20),
    requiredLevel: z.number().int().positive().optional(),
    vocations: z.array(z.string().min(1).max(40)).max(8).optional(),
    weight: z.number().int().nonnegative(),
    description: z.string().min(1).max(500).optional(),
    charges: z.number().int().nonnegative().optional(),
    containerCapacity: z.number().int().nonnegative().optional(),
  })
  .strict();

export const itemUseKindSchema = z.enum([
  "rune",
  "potion",
  "container",
  "rotate",
  "read",
  "food",
  "useWith",
]);

export const inventoryItemPresentationSchema = z
  .object({
    typeId: z.number().int().positive().max(65_535),
    clientId: z.number().int().positive().max(65_535),
    spriteId: z.number().int().positive(),
    name: z.string().min(1).max(120),
    stackable: z.boolean(),
    maxCount: z.number().int().min(1).max(100),
    equipmentSlot: equipmentSlotSchema.optional(),
    twoHanded: z.boolean().optional(),
    containerCapacity: z.number().int().min(0).max(100).optional(),
    useKind: itemUseKindSchema.optional(),
    /** Forge tier (0 = untiered); only classified items ever carry one. */
    tier: z.number().int().min(0).max(10).optional(),
    potionResources: z
      .array(z.enum(["health", "mana"]))
      .min(1)
      .max(2)
      .optional(),
    stowable: z.boolean().optional(),
    /**
     * Running imbuements, so equipped gear can show its icons and time left
     * without opening a shrine. Projected from the item's attribute bag;
     * omitted entirely on items that have none.
     */
    imbuements: z
      .array(
        z
          .object({
            slot: z.number().int().min(0).max(2),
            name: z.string().min(1).max(80),
            iconId: z.number().int().min(0).max(1_000),
            remainingSeconds: z.number().int().min(0).max(72_000),
            /**
             * Whether the category only burns in a fight outside a protection
             * zone, mirroring the byte Canary's imbuement-tracker packet sends
             * (protocolgame.cpp sendInventoryImbuements). Public catalog data,
             * and the only thing the tracker needs to know when to run its
             * display countdown between server checkpoints.
             */
            aggressive: z.boolean(),
          })
          .strict(),
      )
      .max(3)
      .optional(),
    tooltip: itemTooltipSchema,
  })
  .strict();

export const inventoryItemSchema = inventoryItemPresentationSchema
  .extend({
    id: z.string().uuid(),
    count: z.number().int().positive().max(100),
    revision: z.number().int().positive(),
  })
  .strict();

export const inventorySlotEntrySchema = z
  .object({
    slot: z.number().int().min(0).max(99),
    item: inventoryItemSchema,
  })
  .strict();

const equipmentSchema = z
  .object({
    helmet: inventoryItemSchema.optional(),
    amulet: inventoryItemSchema.optional(),
    backpack: inventoryItemSchema.optional(),
    armor: inventoryItemSchema.optional(),
    weapon: inventoryItemSchema.optional(),
    shield: inventoryItemSchema.optional(),
    legs: inventoryItemSchema.optional(),
    boots: inventoryItemSchema.optional(),
    ring: inventoryItemSchema.optional(),
    ammo: inventoryItemSchema.optional(),
  })
  .strict();

export const containerStateSchema = z
  .object({
    container: inventoryItemSchema,
    parentContainerId: z.string().uuid().nullable(),
    capacity: z.number().int().min(0).max(100),
    items: z
      .array(inventorySlotEntrySchema)
      .max(100),
  })
  .strict();

/**
 * One item type the character carries, with the total amount held across
 * equipment and every container — open or closed. Canary keeps the same map
 * (`Player::getInventoryItemsId`) and pushes it on every inventory change
 * (`sendInventoryIds`, 0xF5) so a hotkey keeps drawing an object that lives in
 * a backpack the player has not opened. It is presentation only: no item ids,
 * no locations, nothing the player cannot already see by opening the bag.
 */
export const carriedItemSummarySchema = z
  .object({
    typeId: z.number().int().positive().max(65_535),
    clientId: z.number().int().positive().max(65_535),
    spriteId: z.number().int().positive(),
    name: z.string().min(1).max(120),
    count: z.number().int().positive().max(1_000_000_000),
    equipmentSlot: equipmentSlotSchema.optional(),
    useKind: itemUseKindSchema.optional(),
    potionResources: z
      .array(z.enum(["health", "mana"]))
      .min(1)
      .max(2)
      .optional(),
  })
  .strict();

export const inventoryStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    equipment: equipmentSchema,
    items: z.array(inventorySlotEntrySchema).max(100),
    gold: z.number().int().nonnegative(),
    platinum: z.number().int().nonnegative(),
    crystal: z.number().int().nonnegative(),
    capacityUsed: z.number().int().nonnegative(),
    /** Exact carried weight in hundredths of oz (capacityUsed is rounded). */
    usedWeight: z.number().int().nonnegative(),
    capacityMax: z.number().int().nonnegative(),
    slotCount: z.number().int().min(0).max(100),
    containers: z.array(containerStateSchema).max(16).optional(),
    carried: z.array(carriedItemSummarySchema).max(1_024).optional(),
  })
  .strict();

export type EquipmentSlot = z.infer<typeof equipmentSlotSchema>;
export type QuickLootCategory = z.infer<typeof quickLootCategorySchema>;
export type QuickLootFilter = z.infer<typeof quickLootFilterSchema>;
export type ItemAffix = z.infer<typeof itemAffixSchema>;
export type ItemTooltipData = z.infer<typeof itemTooltipSchema>;
export type ItemUseKind = z.infer<typeof itemUseKindSchema>;
export type CarriedItemSummary = z.infer<typeof carriedItemSummarySchema>;
export type InventoryItemPresentation = z.infer<
  typeof inventoryItemPresentationSchema
>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type InventorySlotEntry = z.infer<typeof inventorySlotEntrySchema>;
export type ContainerState = z.infer<typeof containerStateSchema>;
export type InventoryState = z.infer<typeof inventoryStateSchema>;
