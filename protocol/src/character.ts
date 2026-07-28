import { z } from "zod";
import { DIRECTIONS } from "./direction";
import { PROTOCOL_LIMITS } from "./limits";
import { positionSchema } from "./position";
import { ownProgressionStateSchema } from "./progression";

export const CHARACTER_VOCATIONS = [
  "Knight",
  "Paladin",
  "Sorcerer",
  "Druid",
  "Elite Knight",
  "Royal Paladin",
  "Master Sorcerer",
  "Elder Druid",
  "Monk",
  "Exalted Monk",
] as const;

export const STARTER_VOCATIONS = [
  "Knight",
  "Paladin",
  "Sorcerer",
  "Druid",
  "Monk",
] as const;

export const CHARACTER_SEXES = ["male", "female"] as const;
/**
 * A character's sex is chosen once at creation and never changes. It decides
 * which half of the outfit catalog the character may ever wear, so it is
 * server-side truth: the creation intent carries the sex, never a look type.
 */
export const characterSexSchema = z.enum(CHARACTER_SEXES);

/** The citizen outfit each sex is created wearing. */
export const STARTER_LOOK_TYPE_BY_SEX = {
  male: 128,
  female: 136,
} as const satisfies Record<(typeof CHARACTER_SEXES)[number], number>;

export const CHARACTER_OUTFIT_LOOK_TYPES = [
  STARTER_LOOK_TYPE_BY_SEX.male,
  STARTER_LOOK_TYPE_BY_SEX.female,
] as const;
export const OUTFIT_PALETTE_SIZE = 133;
export const MAX_CHARACTERS_PER_ACCOUNT = 5;

export const characterVocationSchema = z.enum(CHARACTER_VOCATIONS);
export const starterVocationSchema = z.enum(STARTER_VOCATIONS);

/** A displayed look type; ownership is enforced by the entitlement check. */
export const characterLookTypeSchema = z.number().int().min(1).max(65_535);

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

export const ownCharacterStateSchema = characterSummarySchema
  .omit({ level: true })
  .merge(ownProgressionStateSchema)
  .extend({
    position: positionSchema,
    direction: z.enum(DIRECTIONS),
    townId: z.number().int().positive(),
  });

export const characterCreationOptionsSchema = z.object({
  vocations: z.array(starterVocationSchema).min(1),
  sexes: z.array(characterSexSchema).min(1),
  maxCharacters: z.number().int().positive(),
});

export const createCharacterInputSchema = z
  .object({
    name: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
    vocation: starterVocationSchema,
    sex: characterSexSchema,
  })
  .strict();

export type CharacterVocation = z.infer<typeof characterVocationSchema>;
export type StarterVocation = z.infer<typeof starterVocationSchema>;
export type CharacterSex = z.infer<typeof characterSexSchema>;
export type CharacterLookType = z.infer<typeof characterLookTypeSchema>;
export type CharacterOutfit = z.infer<typeof characterOutfitSchema>;
export type CharacterSummary = z.infer<typeof characterSummarySchema>;
export type OwnCharacterState = z.infer<typeof ownCharacterStateSchema>;
export type CharacterCreationOptions = z.infer<
  typeof characterCreationOptionsSchema
>;
export type CreateCharacterInput = z.infer<typeof createCharacterInputSchema>;
