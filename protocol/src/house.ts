import { z } from "zod";
import { BANK_LIMITS } from "./bank";
import { PROTOCOL_LIMITS } from "./limits";
import { positionSchema } from "./position";

export const HOUSE_LIMITS = {
  /** One house mutation per second per session. */
  actionCooldownMs: 1000,
  /** Purchase price is size (sqm) times this, paid from the bank. */
  pricePerSqm: 1000,
  /** Minimum character level to buy a house. */
  buyLevel: 100,
  /** Rent is charged from the bank once per period. */
  rentPeriodDays: 30,
  /** Missed rent charges before eviction. */
  maxWarnings: 7,
  /** Guests plus subowners per house. */
  maxAccessEntries: 100,
  /** Rows per house-list page. */
  listPageSize: 50,
  /** Transfers move at most one bank transaction of gold. */
  maxTransferPrice: BANK_LIMITS.maxTransactionAmount,
  maxHouseNameLength: 100,
  maxHouseSize: 100_000,
} as const;

const houseIdSchema = z.number().int().min(1).max(1_000_000);
const houseTownIdSchema = z.number().int().min(0).max(65_535);
const characterNameSchema = z
  .string()
  .min(1)
  .max(PROTOCOL_LIMITS.maxCharacterNameLength);

/**
 * House intents are fixed-size and covered by the shared transport caps;
 * mutations are limited to one per second per session server-side. Ownership,
 * access level, position, funds, and level are all re-checked server-side at
 * execution time; money and item legs commit in one database transaction.
 */

/** Requests the house projection (own house, or the house at the sender). */
export const houseOpenMessageSchema = z
  .object({
    type: z.literal("house-open"),
    houseId: houseIdSchema.optional(),
  })
  .strict();

/** Buys an unowned house while standing at its entry tile. */
export const houseBuyMessageSchema = z
  .object({
    type: z.literal("house-buy"),
    houseId: houseIdSchema,
  })
  .strict();

/** Gives up the own house; items inside are mailed to the owner's inbox. */
export const houseAbandonMessageSchema = z
  .object({ type: z.literal("house-abandon") })
  .strict();

/** Owner: offers the own house to another player for a price (may be 0). */
export const houseTransferOfferMessageSchema = z
  .object({
    type: z.literal("house-transfer-offer"),
    targetName: characterNameSchema,
    price: z.number().int().min(0).max(HOUSE_LIMITS.maxTransferPrice),
  })
  .strict();

/** Target: accepts or declines a pending transfer offer. */
export const houseTransferRespondMessageSchema = z
  .object({
    type: z.literal("house-transfer-respond"),
    houseId: houseIdSchema,
    accept: z.boolean(),
  })
  .strict();

/** Owner: withdraws the pending outgoing transfer offer. */
export const houseTransferCancelMessageSchema = z
  .object({ type: z.literal("house-transfer-cancel") })
  .strict();

/** Owner (subowners may edit guests): grants or revokes access by name. */
export const houseSetAccessMessageSchema = z
  .object({
    type: z.literal("house-set-access"),
    kind: z.enum(["guest", "subowner"]),
    targetName: characterNameSchema,
    grant: z.boolean(),
  })
  .strict();

/** Owner/subowner: teleports a visitor to the entry; omitted target = self. */
export const houseKickMessageSchema = z
  .object({
    type: z.literal("house-kick"),
    targetCharacterId: z.string().min(1).max(192).optional(),
  })
  .strict();

/** Browses houses (optionally one town); the reply is one bounded page. */
export const houseBrowseMessageSchema = z
  .object({
    type: z.literal("house-browse"),
    townId: houseTownIdSchema.optional(),
    page: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const houseAccessLevelSchema = z.enum([
  "none",
  "guest",
  "subowner",
  "owner",
]);

export const houseAccessEntrySchema = z
  .object({
    characterId: z.string().min(1).max(192),
    name: characterNameSchema,
  })
  .strict();

export const housePendingTransferSchema = z
  .object({
    targetName: characterNameSchema,
    price: z.number().int().min(0).max(HOUSE_LIMITS.maxTransferPrice),
  })
  .strict();

/**
 * Viewer-scoped house projection. Metadata and ownerName are public;
 * `guests`, `subowners`, `paidUntil`, `rentWarnings`, and `pendingTransfer`
 * are present only for the owner (guests/subowners lists also for
 * subowners) — never for outside viewers (charter rule 6).
 */
export const houseStateSchema = z
  .object({
    houseId: houseIdSchema,
    name: z.string().min(1).max(HOUSE_LIMITS.maxHouseNameLength),
    size: z.number().int().min(1).max(HOUSE_LIMITS.maxHouseSize),
    rent: z.number().int().min(0).max(BANK_LIMITS.maxTransactionAmount),
    townId: houseTownIdSchema,
    townName: z.string().max(64).optional(),
    entry: positionSchema,
    guildhall: z.boolean(),
    beds: z.number().int().min(0).max(100),
    /** Purchase price in gold when unowned. */
    price: z.number().int().min(0).max(BANK_LIMITS.maxTransactionAmount),
    ownerName: characterNameSchema.nullable(),
    myAccess: houseAccessLevelSchema,
    /** Epoch ms the rent is paid until; owner/subowner only. */
    paidUntil: z.number().int().min(0).optional(),
    rentWarnings: z
      .number()
      .int()
      .min(0)
      .max(HOUSE_LIMITS.maxWarnings)
      .optional(),
    guests: z
      .array(houseAccessEntrySchema)
      .max(HOUSE_LIMITS.maxAccessEntries)
      .optional(),
    subowners: z
      .array(houseAccessEntrySchema)
      .max(HOUSE_LIMITS.maxAccessEntries)
      .optional(),
    pendingTransfer: housePendingTransferSchema.optional(),
  })
  .strict();

/** One house projection; null when the request resolved to no house. */
export const houseStateMessageSchema = z
  .object({
    type: z.literal("house-state"),
    house: houseStateSchema.nullable(),
  })
  .strict();

/** Public house-list row: metadata plus owner display name only. */
export const houseListEntrySchema = z
  .object({
    houseId: houseIdSchema,
    name: z.string().min(1).max(HOUSE_LIMITS.maxHouseNameLength),
    size: z.number().int().min(1).max(HOUSE_LIMITS.maxHouseSize),
    rent: z.number().int().min(0).max(BANK_LIMITS.maxTransactionAmount),
    townId: houseTownIdSchema,
    townName: z.string().max(64).optional(),
    guildhall: z.boolean(),
    ownerName: characterNameSchema.nullable(),
  })
  .strict();

export const houseListMessageSchema = z
  .object({
    type: z.literal("house-list"),
    entries: z.array(houseListEntrySchema).max(HOUSE_LIMITS.listPageSize),
    page: z.number().int().min(0).max(10_000),
    totalPages: z.number().int().min(0).max(10_001),
    townId: houseTownIdSchema.optional(),
  })
  .strict();

/** Sent to the transfer target only. */
export const houseTransferIncomingMessageSchema = z
  .object({
    type: z.literal("house-transfer-incoming"),
    houseId: houseIdSchema,
    houseName: z.string().min(1).max(HOUSE_LIMITS.maxHouseNameLength),
    fromName: characterNameSchema,
    price: z.number().int().min(0).max(HOUSE_LIMITS.maxTransferPrice),
  })
  .strict();

/** Owner-facing house lifecycle notice; detail is a display name. */
export const houseEventMessageSchema = z
  .object({
    type: z.literal("house-event"),
    kind: z.enum([
      "purchased",
      "transferred",
      "rent-paid",
      "rent-warning",
      "evicted",
      "transfer-cancelled",
    ]),
    houseName: z.string().min(1).max(HOUSE_LIMITS.maxHouseNameLength),
    detail: z.string().max(64).optional(),
    warningsLeft: z
      .number()
      .int()
      .min(0)
      .max(HOUSE_LIMITS.maxWarnings)
      .optional(),
  })
  .strict();

export const houseActionFailedMessageSchema = z
  .object({
    type: z.literal("house-action-failed"),
    reason: z.enum([
      "not-found",
      "not-owner",
      "not-authorized",
      "already-owned",
      "own-house-exists",
      "level-too-low",
      "premium-required",
      "insufficient-funds",
      "not-at-entry",
      "guildhall",
      "target-not-found",
      "target-offline",
      "target-has-house",
      "offer-not-found",
      "access-limit",
      "rate-limited",
      "invalid-request",
    ]),
  })
  .strict();

export type HouseOpenMessage = z.infer<typeof houseOpenMessageSchema>;
export type HouseBuyMessage = z.infer<typeof houseBuyMessageSchema>;
export type HouseAbandonMessage = z.infer<typeof houseAbandonMessageSchema>;
export type HouseTransferOfferMessage = z.infer<
  typeof houseTransferOfferMessageSchema
>;
export type HouseTransferRespondMessage = z.infer<
  typeof houseTransferRespondMessageSchema
>;
export type HouseTransferCancelMessage = z.infer<
  typeof houseTransferCancelMessageSchema
>;
export type HouseSetAccessMessage = z.infer<typeof houseSetAccessMessageSchema>;
export type HouseKickMessage = z.infer<typeof houseKickMessageSchema>;
export type HouseBrowseMessage = z.infer<typeof houseBrowseMessageSchema>;
export type HouseAccessLevel = z.infer<typeof houseAccessLevelSchema>;
export type HouseAccessEntry = z.infer<typeof houseAccessEntrySchema>;
export type HousePendingTransfer = z.infer<typeof housePendingTransferSchema>;
export type HouseState = z.infer<typeof houseStateSchema>;
export type HouseStateMessage = z.infer<typeof houseStateMessageSchema>;
export type HouseListEntry = z.infer<typeof houseListEntrySchema>;
export type HouseListMessage = z.infer<typeof houseListMessageSchema>;
export type HouseTransferIncomingMessage = z.infer<
  typeof houseTransferIncomingMessageSchema
>;
export type HouseEventMessage = z.infer<typeof houseEventMessageSchema>;
export type HouseEventKind = HouseEventMessage["kind"];
export type HouseActionFailedMessage = z.infer<
  typeof houseActionFailedMessageSchema
>;
export type HouseActionFailedReason = HouseActionFailedMessage["reason"];
