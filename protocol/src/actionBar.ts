import { z } from "zod";

export const ACTION_BAR_SLOT_COUNT = 9;

/**
 * Per-character spell bar layout: slot index -> spell id, null for an empty
 * slot. Strict and bounded on purpose: the server persists only spell ids it
 * validated against the character's own spell list, never a free-form blob.
 * A shorter array leaves the remaining slots empty.
 */
export const actionBarSchema = z
  .array(z.string().min(1).max(96).nullable())
  .max(ACTION_BAR_SLOT_COUNT);

export const potionTargetModeSchema = z.enum([
  "self",
  "attack-target",
  "cursor",
  "crosshair",
]);

export const potionActionBarSlotSchema = z
  .object({
    itemTypeId: z.number().int().positive().max(65_535),
    targetMode: potionTargetModeSchema,
  })
  .strict();

/** Per-character potion bar layout; empty arrays retain auto-fill defaults. */
export const potionActionBarSchema = z
  .array(potionActionBarSlotSchema.nullable())
  .max(ACTION_BAR_SLOT_COUNT);

export type ActionBar = z.infer<typeof actionBarSchema>;
export type PotionTargetMode = z.infer<typeof potionTargetModeSchema>;
export type PotionActionBarSlot = z.infer<typeof potionActionBarSlotSchema>;
export type PotionActionBar = z.infer<typeof potionActionBarSchema>;
