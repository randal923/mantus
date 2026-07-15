import { z } from "zod";

export const ITEM_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export const itemRaritySchema = z.enum(ITEM_RARITIES);

export const itemAffixSchema = z
  .object({
    text: z.string().min(1).max(200),
    /** Roll range shown after the value, e.g. "[218 - 461]". */
    range: z.string().min(1).max(40).optional(),
  })
  .strict();

/**
 * Everything the client needs to render an item's hover tooltip. The server
 * composes this; the client never derives stats itself.
 */
export const itemTooltipSchema = z
  .object({
    name: z.string().min(1).max(80),
    rarity: itemRaritySchema,
    /** Flavor line under the name, e.g. "Sacred Legendary Helm". */
    typeLine: z.string().min(1).max(60),
    spriteId: z.number().int().positive(),
    /** Headline stat; Tibia-style single value, e.g. "35 Attack" or "31 Defense". */
    primaryStat: z.string().min(1).max(60).optional(),
    affixes: z.array(itemAffixSchema).max(12),
    requiredLevel: z.number().int().positive().optional(),
    accountBound: z.boolean().optional(),
    sellValue: z.number().int().nonnegative().optional(),
    durability: z
      .object({
        current: z.number().int().nonnegative(),
        max: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ItemRarity = z.infer<typeof itemRaritySchema>;
export type ItemAffix = z.infer<typeof itemAffixSchema>;
export type ItemTooltipData = z.infer<typeof itemTooltipSchema>;
