import { z } from "zod";
import { DIRECTIONS } from "./direction";
import { PROTOCOL_LIMITS } from "./limits";
import { positionSchema } from "./position";

export const CHARACTER_VOCATIONS = [
  "Knight",
  "Paladin",
  "Sorcerer",
  "Druid",
] as const;

export const CHARACTER_OUTFIT_LOOK_TYPES = [128, 136] as const;
export const OUTFIT_PALETTE_SIZE = 133;
export const MAX_CHARACTERS_PER_ACCOUNT = 5;

export const characterVocationSchema = z.enum(CHARACTER_VOCATIONS);

export const characterLookTypeSchema = z.union([
  z.literal(CHARACTER_OUTFIT_LOOK_TYPES[0]),
  z.literal(CHARACTER_OUTFIT_LOOK_TYPES[1]),
]);

const outfitPaletteIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(OUTFIT_PALETTE_SIZE - 1);

export const characterOutfitSchema = z.object({
  lookType: characterLookTypeSchema,
  head: outfitPaletteIndexSchema,
  body: outfitPaletteIndexSchema,
  legs: outfitPaletteIndexSchema,
  feet: outfitPaletteIndexSchema,
  addons: z.number().int().min(0).max(3),
});

export const characterSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
  vocation: characterVocationSchema,
  level: z.number().int().positive(),
  outfit: characterOutfitSchema,
  lastLoginAt: z.string().datetime().nullable(),
});

export const ownCharacterStateSchema = characterSummarySchema.extend({
  experience: z.number().int().nonnegative(),
  health: z.number().int().nonnegative(),
  maxHealth: z.number().int().positive(),
  mana: z.number().int().nonnegative(),
  maxMana: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
  position: positionSchema,
  direction: z.enum(DIRECTIONS),
  townId: z.number().int().positive(),
});

export const characterCreationOptionsSchema = z.object({
  vocations: z.array(characterVocationSchema).min(1),
  outfits: z
    .array(
      z.object({
        lookType: characterLookTypeSchema,
        label: z.enum(["citizen-male", "citizen-female"]),
      }),
    )
    .min(1),
  maxCharacters: z.number().int().positive(),
});

export const createCharacterInputSchema = z
  .object({
    name: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
    vocation: characterVocationSchema,
    lookType: characterLookTypeSchema,
  })
  .strict();

export type CharacterVocation = z.infer<typeof characterVocationSchema>;
export type CharacterLookType = z.infer<typeof characterLookTypeSchema>;
export type CharacterOutfit = z.infer<typeof characterOutfitSchema>;
export type CharacterSummary = z.infer<typeof characterSummarySchema>;
export type OwnCharacterState = z.infer<typeof ownCharacterStateSchema>;
export type CharacterCreationOptions = z.infer<
  typeof characterCreationOptionsSchema
>;
export type CreateCharacterInput = z.infer<typeof createCharacterInputSchema>;
