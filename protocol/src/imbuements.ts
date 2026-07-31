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
  /** utils_definitions.hpp ITEM_EMPTY_IMBUEMENT_SCROLL — spent to forge one. */
  blankScrollItemTypeId: 51_442,
} as const;

const itemIdSchema = z.string().uuid();
const imbuementIdSchema = z.number().int().min(1).max(200);

/**
 * `itemId: null` is the shrine's "Pick Item" state: the window opens with no
 * item chosen. Adjacency is still validated, so the empty window is not a way
 * to read the catalog from anywhere on the map.
 */
export const imbuementWindowGetMessageSchema = z
  .object({
    type: z.literal("imbuement-window-get"),
    itemId: itemIdSchema.nullable(),
    /** Scroll mode forges a blank scroll instead of imbuing a carried item. */
    mode: z.enum(["item", "scroll"]).default("item"),
  })
  .strict();

/** Forges an imbuement scroll from a blank one (Canary createScrollImbuement). */
export const imbuementScrollCreateMessageSchema = z
  .object({
    type: z.literal("imbuement-scroll-create"),
    imbuementId: imbuementIdSchema,
  })
  .strict();

/** Spends a filled scroll on a carried item (Canary applyScrollImbuement). */
export const imbuementScrollApplyMessageSchema = z
  .object({
    type: z.literal("imbuement-scroll-apply"),
    scrollItemId: itemIdSchema,
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
    /** Carried + stash, matching what applying will actually spend. */
    available: z.number().int().min(0),
    /** The stash share of `available`; drives the "from your stash" hint. */
    stashAvailable: z.number().int().min(0),
  })
  .strict();

/**
 * Why an option cannot be applied right now. `null` means it can. The client
 * greys the row instead of hiding it, so all three tiers stay visible the way
 * Tibia's Basic/Intricate/Powerful buttons do.
 */
export const imbuementBlockedReasonSchema = z.enum([
  "wrong-category",
  "duplicate-imbuement",
  "premium-required",
  "insufficient-materials",
  "no-blank-scroll",
]);

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
    /** Set whenever `canApply` is false; the first failing check. */
    blockedReason: imbuementBlockedReasonSchema.nullable(),
  })
  .strict();

export const imbuementWindowStateMessageSchema = z
  .object({
    type: z.literal("imbuement-window-state"),
    mode: z.enum(["item", "scroll"]),
    /** Null in the shrine's "Pick Item" state and in scroll mode. */
    itemId: itemIdSchema.nullable(),
    itemTypeId: z.number().int().min(1).max(65_535).nullable(),
    slotCount: z.number().int().min(0).max(IMBUEMENT_RULES.maxSlots),
    slots: z.array(imbuementSlotStateSchema).max(IMBUEMENT_RULES.maxSlots),
    options: z
      .array(imbuementOptionSchema)
      .max(IMBUEMENT_RULES.maxWindowOptions),
    removeCostGold: z.number().int().min(0),
    /** Blank scrolls carried + stashed; gates the scroll-mode rail button. */
    blankScrollCount: z.number().int().min(0),
    /** Bank balance imbuing is paid from, for the window's gold counter. */
    bankBalance: z.number().int().min(0),
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
      "no-blank-scroll",
      "no-free-slot",
      "invalid-scroll",
    ]),
  })
  .strict();

export type ImbuementWindowGetMessage = z.infer<
  typeof imbuementWindowGetMessageSchema
>;
export type ImbuementApplyMessage = z.infer<typeof imbuementApplyMessageSchema>;
export type ImbuementClearMessage = z.infer<typeof imbuementClearMessageSchema>;
export type ImbuementScrollCreateMessage = z.infer<
  typeof imbuementScrollCreateMessageSchema
>;
export type ImbuementScrollApplyMessage = z.infer<
  typeof imbuementScrollApplyMessageSchema
>;
export type ImbuementBlockedReason = z.infer<
  typeof imbuementBlockedReasonSchema
>;
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
