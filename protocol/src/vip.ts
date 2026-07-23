import { z } from "zod";
import { characterVocationSchema } from "./character";
import { PROTOCOL_LIMITS } from "./limits";

export const VIP_LIMITS = {
  freeMaxEntries: 20,
  /** Protocol and premium-account maximum. */
  maxEntries: 100,
  /** One VIP mutation per half second per session. */
  actionCooldownMs: 500,
  maxDescriptionLength: 128,
  maxIconId: 10,
} as const;

/**
 * VIP intents are fixed-size and covered by the shared 4096-byte /
 * 30-per-second transport caps; mutations are further limited to one per
 * 500 ms per session server-side. The list is private to its owner: the
 * server resolves names at execution time and presence is revealed only
 * for characters actually on the requester's own list (charter rule 6).
 */

/** Adds one existing character (by display name) to the own VIP list. */
export const vipAddMessageSchema = z
  .object({
    type: z.literal("vip-add"),
    name: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

/** Removes one entry from the own VIP list. */
export const vipRemoveMessageSchema = z
  .object({
    type: z.literal("vip-remove"),
    targetCharacterId: z.string().min(1).max(192),
  })
  .strict();

/** Edits one own entry's description, icon, or login notification flag. */
export const vipEditMessageSchema = z
  .object({
    type: z.literal("vip-edit"),
    targetCharacterId: z.string().min(1).max(192),
    description: z.string().max(VIP_LIMITS.maxDescriptionLength).optional(),
    icon: z.number().int().min(0).max(VIP_LIMITS.maxIconId).optional(),
    notifyLogin: z.boolean().optional(),
  })
  .strict();

export const vipEntrySchema = z
  .object({
    characterId: z.string().min(1).max(192),
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    level: z.number().int().min(1),
    vocation: characterVocationSchema,
    online: z.boolean(),
    description: z.string().max(VIP_LIMITS.maxDescriptionLength),
    icon: z.number().int().min(0).max(VIP_LIMITS.maxIconId),
    notifyLogin: z.boolean(),
  })
  .strict();

/**
 * The requester's own full VIP list; sent on login and after each
 * mutation. Never carries any other player's list.
 */
export const vipStateMessageSchema = z
  .object({
    type: z.literal("vip-state"),
    entries: z.array(vipEntrySchema).max(VIP_LIMITS.maxEntries),
  })
  .strict();

/**
 * Presence push for one listed character; sent only to online players
 * whose own list contains that character.
 */
export const vipStatusChangedMessageSchema = z
  .object({
    type: z.literal("vip-status-changed"),
    characterId: z.string().min(1).max(192),
    online: z.boolean(),
  })
  .strict();

export const vipActionFailedMessageSchema = z
  .object({
    type: z.literal("vip-action-failed"),
    reason: z.enum([
      "not-found",
      "already-added",
      "list-full",
      "cannot-add-self",
      "rate-limited",
      "invalid-request",
    ]),
  })
  .strict();

export type VipAddMessage = z.infer<typeof vipAddMessageSchema>;
export type VipRemoveMessage = z.infer<typeof vipRemoveMessageSchema>;
export type VipEditMessage = z.infer<typeof vipEditMessageSchema>;
export type VipEntry = z.infer<typeof vipEntrySchema>;
export type VipStateMessage = z.infer<typeof vipStateMessageSchema>;
export type VipStatusChangedMessage = z.infer<
  typeof vipStatusChangedMessageSchema
>;
export type VipActionFailedMessage = z.infer<
  typeof vipActionFailedMessageSchema
>;
export type VipActionFailedReason = VipActionFailedMessage["reason"];
