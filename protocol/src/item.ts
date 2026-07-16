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

export const inventoryItemSchema = z
  .object({
    id: z.string().uuid(),
    typeId: z.number().int().positive().max(65_535),
    clientId: z.number().int().positive().max(65_535),
    spriteId: z.number().int().positive(),
    name: z.string().min(1).max(120),
    count: z.number().int().positive().max(100),
    revision: z.number().int().positive(),
    equipmentSlot: equipmentSlotSchema.optional(),
    useKind: z.literal("rune").optional(),
    tooltip: itemTooltipSchema,
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

export const inventoryStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    equipment: equipmentSchema,
    items: z.array(inventoryItemSchema).max(100),
    gold: z.number().int().nonnegative(),
    platinum: z.number().int().nonnegative(),
    capacityUsed: z.number().int().nonnegative(),
    capacityMax: z.number().int().nonnegative(),
    slotCount: z.number().int().min(0).max(100),
  })
  .strict();

export type EquipmentSlot = z.infer<typeof equipmentSlotSchema>;
export type ItemAffix = z.infer<typeof itemAffixSchema>;
export type ItemTooltipData = z.infer<typeof itemTooltipSchema>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type InventoryState = z.infer<typeof inventoryStateSchema>;
