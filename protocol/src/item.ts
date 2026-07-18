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
    useKind: z
      .enum(["rune", "container", "rotate", "read", "food"])
      .optional(),
    stowable: z.boolean().optional(),
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
  })
  .strict();

export type EquipmentSlot = z.infer<typeof equipmentSlotSchema>;
export type ItemAffix = z.infer<typeof itemAffixSchema>;
export type ItemTooltipData = z.infer<typeof itemTooltipSchema>;
export type InventoryItemPresentation = z.infer<
  typeof inventoryItemPresentationSchema
>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type InventorySlotEntry = z.infer<typeof inventorySlotEntrySchema>;
export type ContainerState = z.infer<typeof containerStateSchema>;
export type InventoryState = z.infer<typeof inventoryStateSchema>;
