import { z } from "zod";
import { OUTFIT_PALETTE_SIZE } from "./character";

export const OUTFIT_LIMITS = {
  maxOutfits: 200,
  maxMounts: 200,
  maxNameLength: 40,
  /** One outfit change per second per session. */
  changeCooldownMs: 1_000,
} as const;

const lookTypeSchema = z.number().int().min(1).max(65_535);
/** 0 means "no mount"; anything else must be an owned mount. */
const mountIdSchema = z.number().int().min(0).max(65_535);
const paletteIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(OUTFIT_PALETTE_SIZE - 1);

/**
 * Changes the character's displayed outfit and mount. Every id here is a
 * *request*: the server validates the look type, its addons, and the mount
 * against the character's own entitlement rows at execution time, and an
 * unowned id never reaches another client's view (charter rules 1 and 4).
 */
export const outfitSelectMessageSchema = z
  .object({
    type: z.literal("outfit-select"),
    lookType: lookTypeSchema,
    head: paletteIndexSchema,
    body: paletteIndexSchema,
    legs: paletteIndexSchema,
    feet: paletteIndexSchema,
    addons: z.number().int().min(0).max(3),
    mountId: mountIdSchema,
  })
  .strict();

/** Asks for the outfit window's contents (own entitlements only). */
export const outfitGetMessageSchema = z
  .object({ type: z.literal("outfit-get") })
  .strict();

export const outfitEntitlementSchema = z
  .object({
    lookType: lookTypeSchema,
    name: z.string().min(1).max(OUTFIT_LIMITS.maxNameLength),
    addons: z.number().int().min(0).max(3),
  })
  .strict();

export const mountEntitlementSchema = z
  .object({
    mountId: z.number().int().min(1).max(65_535),
    name: z.string().min(1).max(OUTFIT_LIMITS.maxNameLength),
    /** The mount's outfit sprite, so the picker can preview it. */
    lookType: lookTypeSchema,
    /** Server-side walk-speed bonus this mount grants. */
    speed: z.number().int().min(0).max(1_000),
  })
  .strict();

/**
 * The requester's own outfit window: only entitled outfits and mounts, plus
 * the current selection. A character never learns what anybody else owns.
 */
export const outfitStateMessageSchema = z
  .object({
    type: z.literal("outfit-state"),
    outfits: z.array(outfitEntitlementSchema).max(OUTFIT_LIMITS.maxOutfits),
    mounts: z.array(mountEntitlementSchema).max(OUTFIT_LIMITS.maxMounts),
    selectedLookType: lookTypeSchema,
    selectedMountId: mountIdSchema,
  })
  .strict();

export const outfitActionFailedMessageSchema = z
  .object({
    type: z.literal("outfit-action-failed"),
    reason: z.enum(["not-owned", "rate-limited", "invalid-request"]),
  })
  .strict();

export type OutfitSelectMessage = z.infer<typeof outfitSelectMessageSchema>;
export type OutfitGetMessage = z.infer<typeof outfitGetMessageSchema>;
export type OutfitEntitlement = z.infer<typeof outfitEntitlementSchema>;
export type MountEntitlement = z.infer<typeof mountEntitlementSchema>;
export type OutfitStateMessage = z.infer<typeof outfitStateMessageSchema>;
export type OutfitActionFailedMessage = z.infer<
  typeof outfitActionFailedMessageSchema
>;
export type OutfitActionFailedReason =
  OutfitActionFailedMessage["reason"];
