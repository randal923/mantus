import { z } from "zod";
import { OUTFIT_PALETTE_SIZE } from "./character";
import { DIRECTIONS } from "./direction";
import { positionSchema } from "./position";

export const CREATURE_KINDS = ["player", "monster", "npc"] as const;

/**
 * Nameplate skull marks. white/red/black are public persistent skulls sent
 * to every viewer; yellow (attacked me) and orange (unavenged kill on me)
 * are viewer-relative and computed per recipient server-side — a client
 * only ever receives the marks its own player is allowed to see.
 */
export const SKULL_MARKS = [
  "white",
  "red",
  "black",
  "yellow",
  "orange",
] as const;

export const skullMarkSchema = z.enum(SKULL_MARKS);

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
  /**
   * Public "is in a party" marker (gray shield), visible to everyone like in
   * Tibia. Colored own-party shields are derived client-side from party-state
   * and are never broadcast.
   */
  partyStatus: z.enum(["member"]).optional(),
  /**
   * Public guild affiliation (guild names are public in Tibia). `atWar` is
   * true while that guild has at least one active war; viewer-relative war
   * emblems are derived client-side from these two public facts plus the
   * viewer's own guild-state — enemy rosters are never broadcast.
   */
  guildName: z.string().min(3).max(29).optional(),
  atWar: z.boolean().optional(),
  skull: skullMarkSchema.optional(),
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
export type SkullMark = z.infer<typeof skullMarkSchema>;
