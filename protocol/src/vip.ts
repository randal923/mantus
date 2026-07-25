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
  /** VIP groups per character, and the length of a group name. */
  maxGroups: 20,
  maxGroupNameLength: 32,
  /** Open friend requests a character may have in each direction. */
  maxFriendRequests: 50,
  /** Accepted, reciprocal friendships per character. */
  maxFriends: 200,
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

const characterIdSchema = z.string().min(1).max(192);
const groupNameSchema = z.string().min(1).max(VIP_LIMITS.maxGroupNameLength);

/** Creates one named VIP group on the own list. */
export const vipGroupCreateMessageSchema = z
  .object({ type: z.literal("vip-group-create"), name: groupNameSchema })
  .strict();

/** Deletes one own group; its entries fall back to the ungrouped list. */
export const vipGroupDeleteMessageSchema = z
  .object({ type: z.literal("vip-group-delete"), groupId: characterIdSchema })
  .strict();

/** Moves one own entry into a group, or out of every group with null. */
export const vipAssignGroupMessageSchema = z
  .object({
    type: z.literal("vip-assign-group"),
    targetCharacterId: characterIdSchema,
    groupId: characterIdSchema.nullable(),
  })
  .strict();

/**
 * Asks another character to become a reciprocal friend. The server resolves
 * the name and owns the request row; the sender never supplies an id.
 */
export const friendRequestMessageSchema = z
  .object({
    type: z.literal("friend-request"),
    name: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

/**
 * Accepts or declines one incoming request, addressed by the requester id the
 * server itself sent in `friend-state`. A forged id resolves to no row.
 */
export const friendRespondMessageSchema = z
  .object({
    type: z.literal("friend-respond"),
    fromCharacterId: characterIdSchema,
    accept: z.boolean(),
  })
  .strict();

/** Ends a friendship (both halves) or withdraws an outgoing request. */
export const friendRemoveMessageSchema = z
  .object({
    type: z.literal("friend-remove"),
    targetCharacterId: characterIdSchema,
  })
  .strict();

/** Per-character privacy switches other systems read at query time. */
export const socialSetSettingsMessageSchema = z
  .object({
    type: z.literal("social-set-settings"),
    finderVisible: z.boolean(),
  })
  .strict();

export const vipGroupSchema = z
  .object({ groupId: characterIdSchema, name: groupNameSchema })
  .strict();

export const vipEntrySchema = z
  .object({
    characterId: characterIdSchema,
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    level: z.number().int().min(1),
    vocation: characterVocationSchema,
    online: z.boolean(),
    description: z.string().max(VIP_LIMITS.maxDescriptionLength),
    icon: z.number().int().min(0).max(VIP_LIMITS.maxIconId),
    notifyLogin: z.boolean(),
    /** Null when the entry sits in the ungrouped list. */
    groupId: characterIdSchema.nullable(),
  })
  .strict();

/** One friend or pending request; presence only for accepted friends. */
export const friendEntrySchema = z
  .object({
    characterId: characterIdSchema,
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    online: z.boolean(),
  })
  .strict();

/**
 * The requester's own friendships and pending requests, plus their privacy
 * switches. Private to its owner, exactly like `vip-state`.
 */
export const friendStateMessageSchema = z
  .object({
    type: z.literal("friend-state"),
    friends: z.array(friendEntrySchema).max(VIP_LIMITS.maxFriends),
    incoming: z.array(friendEntrySchema).max(VIP_LIMITS.maxFriendRequests),
    outgoing: z.array(friendEntrySchema).max(VIP_LIMITS.maxFriendRequests),
    finderVisible: z.boolean(),
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
    groups: z.array(vipGroupSchema).max(VIP_LIMITS.maxGroups),
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
      "already-friends",
      "request-pending",
      "request-not-found",
      "rate-limited",
      "invalid-request",
    ]),
  })
  .strict();

export type VipGroupCreateMessage = z.infer<typeof vipGroupCreateMessageSchema>;
export type VipGroupDeleteMessage = z.infer<typeof vipGroupDeleteMessageSchema>;
export type VipAssignGroupMessage = z.infer<
  typeof vipAssignGroupMessageSchema
>;
export type FriendRequestMessage = z.infer<typeof friendRequestMessageSchema>;
export type FriendRespondMessage = z.infer<typeof friendRespondMessageSchema>;
export type FriendRemoveMessage = z.infer<typeof friendRemoveMessageSchema>;
export type SocialSetSettingsMessage = z.infer<
  typeof socialSetSettingsMessageSchema
>;
export type VipGroup = z.infer<typeof vipGroupSchema>;
export type FriendEntry = z.infer<typeof friendEntrySchema>;
export type FriendStateMessage = z.infer<typeof friendStateMessageSchema>;
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
