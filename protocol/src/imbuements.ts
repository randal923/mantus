import { z } from "zod";

/**
 * Imbuements (Feature 78), transcribed from pinned Canary
 * data/XML/imbuements.xml and player.cpp:2658-2788. The catalog itself is
 * server content (content/imbuements.json); the window projection carries
 * everything the client renders, including the player's own material
 * counts, so nothing is computed client-side.
 *
 * Parity note: this Canary has no success roll — applying always succeeds
 * and the XML `percent`/`protectionPrice` are display-only. Mirrored here.
 */
export const IMBUEMENT_RULES = {
  maxSlots: 3,
  maxPowerLevel: 3,
  /** All three power levels last 20 hours of qualifying decay time. */
  durationSeconds: 72_000,
  /** Removal always costs 15000 gold (imbuements.xml base removecost). */
  removeCostGold: 15_000,
  /** One imbuement mutation per session per this window. */
  actionCooldownMs: 300,
  maxWindowOptions: 80,
} as const;

const itemIdSchema = z.string().uuid();
const imbuementIdSchema = z.number().int().min(1).max(200);

export const imbuementWindowGetMessageSchema = z
  .object({
    type: z.literal("imbuement-window-get"),
    itemId: itemIdSchema,
  })
  .strict();

export const imbuementApplyMessageSchema = z
  .object({
    type: z.literal("imbuement-apply"),
    itemId: itemIdSchema,
    slot: z.number().int().min(0).max(IMBUEMENT_RULES.maxSlots - 1),
    imbuementId: imbuementIdSchema,
  })
  .strict();

export const imbuementClearMessageSchema = z
  .object({
    type: z.literal("imbuement-clear"),
    itemId: itemIdSchema,
    slot: z.number().int().min(0).max(IMBUEMENT_RULES.maxSlots - 1),
  })
  .strict();

const imbuementSlotStateSchema = z
  .object({
    slot: z.number().int().min(0).max(IMBUEMENT_RULES.maxSlots - 1),
    imbuementId: imbuementIdSchema.nullable(),
    name: z.string().max(80).nullable(),
    baseName: z.string().max(20).nullable(),
    iconId: z.number().int().min(0).max(1_000).nullable(),
    remainingSeconds: z
      .number()
      .int()
      .min(0)
      .max(IMBUEMENT_RULES.durationSeconds),
  })
  .strict();

const imbuementMaterialSchema = z
  .object({
    itemTypeId: z.number().int().min(1).max(65_535),
    name: z.string().min(1).max(100),
    count: z.number().int().min(1).max(100),
    /** The player's own carried count at projection time. */
    available: z.number().int().min(0),
  })
  .strict();

const imbuementOptionSchema = z
  .object({
    imbuementId: imbuementIdSchema,
    name: z.string().min(1).max(80),
    baseId: z.number().int().min(1).max(3),
    baseName: z.string().min(1).max(20),
    categorySlug: z.string().min(1).max(40),
    iconId: z.number().int().min(0).max(1_000),
    description: z.string().max(300),
    priceGold: z.number().int().min(0),
    premium: z.boolean(),
    materials: z.array(imbuementMaterialSchema).max(4),
    /** All execution-time checks pass right now (re-checked on apply). */
    canApply: z.boolean(),
  })
  .strict();

export const imbuementWindowStateMessageSchema = z
  .object({
    type: z.literal("imbuement-window-state"),
    itemId: itemIdSchema,
    itemTypeId: z.number().int().min(1).max(65_535),
    slotCount: z.number().int().min(0).max(IMBUEMENT_RULES.maxSlots),
    slots: z.array(imbuementSlotStateSchema).max(IMBUEMENT_RULES.maxSlots),
    options: z
      .array(imbuementOptionSchema)
      .max(IMBUEMENT_RULES.maxWindowOptions),
    removeCostGold: z.number().int().min(0),
  })
  .strict();

export const imbuementActionFailedMessageSchema = z
  .object({
    type: z.literal("imbuement-action-failed"),
    reason: z.enum([
      "invalid-item",
      "no-shrine",
      "invalid-slot",
      "slot-occupied",
      "slot-empty",
      "wrong-category",
      "duplicate-imbuement",
      "premium-required",
      "insufficient-materials",
      "insufficient-gold",
      "rate-limited",
      "invalid-request",
    ]),
  })
  .strict();

export type ImbuementWindowGetMessage = z.infer<
  typeof imbuementWindowGetMessageSchema
>;
export type ImbuementApplyMessage = z.infer<typeof imbuementApplyMessageSchema>;
export type ImbuementClearMessage = z.infer<typeof imbuementClearMessageSchema>;
export type ImbuementSlotState = z.infer<typeof imbuementSlotStateSchema>;
export type ImbuementMaterial = z.infer<typeof imbuementMaterialSchema>;
export type ImbuementOption = z.infer<typeof imbuementOptionSchema>;
export type ImbuementWindowStateMessage = z.infer<
  typeof imbuementWindowStateMessageSchema
>;
export type ImbuementActionFailedMessage = z.infer<
  typeof imbuementActionFailedMessageSchema
>;
export type ImbuementActionFailedReason =
  ImbuementActionFailedMessage["reason"];
