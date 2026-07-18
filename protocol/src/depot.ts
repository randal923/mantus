import { z } from "zod";
import { PROTOCOL_LIMITS } from "./limits";

export const DEPOT_LIMITS = {
  maxDepotItems: 2_000,
  // Canary's default inbox is effectively unlimited; adversarial sessions need a hard cap.
  maxInboxItems: 2_000,
  maxStashAmount: 1_000_000_000,
  maxTransferCount: 100,
  pageSize: 24,
  maxSearchLength: 60,
  mailExpiryDays: 30,
} as const;

/**
 * Storage intents stay below the shared 4096-byte transport cap. Normal
 * clients keep one storage operation in flight; the shared 30-message/second
 * connection limit remains the hard rate ceiling.
 */

export const depotLocationSchema = z.enum(["depot", "inbox", "stash"]);

const storageSessionSchema = z.string().uuid();
const itemIdSchema = z.string().uuid();
const itemTypeIdSchema = z.number().int().min(1).max(65_535);
const revisionSchema = z.number().int().positive();
const itemCountSchema = z
  .number()
  .int()
  .positive()
  .max(DEPOT_LIMITS.maxTransferCount);

export const depotDepositMessageSchema = z
  .object({
    type: z.literal("depot-deposit"),
    sessionId: storageSessionSchema,
    depotRevision: revisionSchema,
    itemId: itemIdSchema,
    itemRevision: revisionSchema,
  })
  .strict();

export const depotWithdrawMessageSchema = z
  .object({
    type: z.literal("depot-withdraw"),
    sessionId: storageSessionSchema,
    source: z.enum(["depot", "inbox"]),
    sourceRevision: revisionSchema,
    itemId: itemIdSchema,
    itemRevision: revisionSchema,
  })
  .strict();

export const depotBrowseMessageSchema = z
  .object({
    type: z.literal("depot-browse"),
    sessionId: storageSessionSchema,
    location: depotLocationSchema,
    page: z.number().int().min(1).max(100_000),
    query: z.string().trim().max(DEPOT_LIMITS.maxSearchLength),
  })
  .strict();

export const stashDepositMessageSchema = z
  .object({
    type: z.literal("stash-deposit"),
    sessionId: storageSessionSchema,
    stashRevision: revisionSchema,
    itemId: itemIdSchema,
    itemRevision: revisionSchema,
    count: itemCountSchema,
  })
  .strict();

export const stashWithdrawMessageSchema = z
  .object({
    type: z.literal("stash-withdraw"),
    sessionId: storageSessionSchema,
    stashRevision: revisionSchema,
    itemTypeId: itemTypeIdSchema,
    count: itemCountSchema,
  })
  .strict();

export const closeDepotMessageSchema = z
  .object({
    type: z.literal("close-depot"),
    sessionId: storageSessionSchema,
  })
  .strict();

export const sendMailMessageSchema = z
  .object({
    type: z.literal("send-mail"),
    sessionId: storageSessionSchema,
    requestId: z.string().uuid(),
    itemId: itemIdSchema,
    itemRevision: revisionSchema,
    recipientName: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

export const closeMailboxMessageSchema = z
  .object({
    type: z.literal("close-mailbox"),
    sessionId: storageSessionSchema,
  })
  .strict();

export const depotItemEntrySchema = z
  .object({
    location: z.enum(["depot", "inbox"]),
    slot: z.number().int().min(0).max(DEPOT_LIMITS.maxInboxItems - 1),
    itemId: itemIdSchema,
    itemTypeId: itemTypeIdSchema,
    clientId: itemTypeIdSchema,
    spriteId: z.number().int().positive(),
    name: z.string().min(1).max(120),
    stackable: z.boolean(),
    maxCount: z.number().int().min(1).max(100),
    weight: z.number().int().nonnegative(),
    stowable: z.boolean().optional(),
    count: z.number().int().positive().max(100),
    revision: revisionSchema,
    containedItemCount: z.number().int().min(0).max(DEPOT_LIMITS.maxDepotItems),
  })
  .strict();

export const stashEntrySchema = z
  .object({
    location: z.literal("stash"),
    itemTypeId: itemTypeIdSchema,
    clientId: itemTypeIdSchema,
    spriteId: z.number().int().positive(),
    name: z.string().min(1).max(120),
    stackable: z.boolean(),
    maxCount: z.number().int().min(1).max(100),
    weight: z.number().int().nonnegative(),
    stowable: z.boolean().optional(),
    count: z.number().int().positive().max(DEPOT_LIMITS.maxStashAmount),
  })
  .strict();

export const depotEntrySchema = z.discriminatedUnion("location", [
  depotItemEntrySchema,
  stashEntrySchema,
]);

export const depotStateMessageSchema = z
  .object({
    type: z.literal("depot-state"),
    sessionId: storageSessionSchema,
    depotId: z.number().int().positive().max(65_535),
    townName: z.string().min(1).max(100),
    depotRevision: revisionSchema,
    inboxRevision: revisionSchema,
    stashRevision: revisionSchema,
    depotCount: z.number().int().min(0).max(DEPOT_LIMITS.maxDepotItems),
    inboxCount: z.number().int().min(0).max(DEPOT_LIMITS.maxInboxItems),
    stashCount: z.number().int().min(0).max(65_535),
    depotCapacity: z.literal(DEPOT_LIMITS.maxDepotItems),
    inboxCapacity: z.literal(DEPOT_LIMITS.maxInboxItems),
    location: depotLocationSchema,
    query: z.string().max(DEPOT_LIMITS.maxSearchLength),
    page: z.number().int().positive(),
    pageCount: z.number().int().positive(),
    entries: z.array(depotEntrySchema).max(DEPOT_LIMITS.pageSize),
  })
  .strict();

export const depotActionFailedMessageSchema = z
  .object({
    type: z.literal("depot-action-failed"),
    reason: z.enum([
      "out-of-range",
      "busy",
      "stale",
      "not-owned",
      "invalid-item",
      "depot-full",
      "inbox-full",
      "stash-only",
      "no-space",
      "no-capacity",
      "failed",
    ]),
  })
  .strict();

export const mailboxOpenedMessageSchema = z
  .object({
    type: z.literal("mailbox-opened"),
    sessionId: storageSessionSchema,
  })
  .strict();

export const mailSentMessageSchema = z
  .object({
    type: z.literal("mail-sent"),
    requestId: z.string().uuid(),
    recipientName: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

export const mailActionFailedMessageSchema = z
  .object({
    type: z.literal("mail-action-failed"),
    reason: z.enum([
      "out-of-range",
      "busy",
      "recipient-not-found",
      "invalid-recipient",
      "not-owned",
      "inbox-full",
      "failed",
    ]),
  })
  .strict();

export type DepotLocation = z.infer<typeof depotLocationSchema>;
export type DepotDepositMessage = z.infer<typeof depotDepositMessageSchema>;
export type DepotWithdrawMessage = z.infer<typeof depotWithdrawMessageSchema>;
export type DepotBrowseMessage = z.infer<typeof depotBrowseMessageSchema>;
export type StashDepositMessage = z.infer<typeof stashDepositMessageSchema>;
export type StashWithdrawMessage = z.infer<typeof stashWithdrawMessageSchema>;
export type CloseDepotMessage = z.infer<typeof closeDepotMessageSchema>;
export type SendMailMessage = z.infer<typeof sendMailMessageSchema>;
export type CloseMailboxMessage = z.infer<typeof closeMailboxMessageSchema>;
export type DepotItemEntry = z.infer<typeof depotItemEntrySchema>;
export type StashEntry = z.infer<typeof stashEntrySchema>;
export type DepotEntry = z.infer<typeof depotEntrySchema>;
export type DepotStateMessage = z.infer<typeof depotStateMessageSchema>;
export type DepotActionFailedReason = z.infer<
  typeof depotActionFailedMessageSchema
>["reason"];
export type MailActionFailedReason = z.infer<
  typeof mailActionFailedMessageSchema
>["reason"];
