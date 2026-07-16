import { z } from "zod";
import { OUTFIT_PALETTE_SIZE } from "./character";
import { DIRECTIONS } from "./direction";
import { positionSchema } from "./position";

export const CREATURE_KINDS = ["player", "monster", "npc"] as const;

const outfitPaletteIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(OUTFIT_PALETTE_SIZE - 1);

export const creatureOutfitSchema = z.object({
  lookType: z.number().int().nonnegative().max(65_535),
  lookTypeEx: z.number().int().positive().max(65_535).optional(),
  head: outfitPaletteIndexSchema,
  body: outfitPaletteIndexSchema,
  legs: outfitPaletteIndexSchema,
  feet: outfitPaletteIndexSchema,
  addons: z.number().int().min(0).max(3),
});

export const creatureStateSchema = z.object({
  id: z.string().min(1).max(192),
  kind: z.enum(CREATURE_KINDS),
  name: z.string().min(1).max(100),
  position: positionSchema,
  positionRevision: z.number().int().nonnegative(),
  direction: z.enum(DIRECTIONS),
  outfit: creatureOutfitSchema,
  healthPercent: z.number().int().min(0).max(100).nullable(),
  light: z
    .object({
      intensity: z.number().int().min(0).max(255),
      color: z.number().int().min(0).max(255),
    })
    .optional(),
});

export type CreatureKind = z.infer<typeof creatureStateSchema>["kind"];
export type CreatureOutfit = z.infer<typeof creatureOutfitSchema>;
export type CreatureState = z.infer<typeof creatureStateSchema>;
