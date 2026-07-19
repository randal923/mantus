import { z } from "zod";
import { PROTOCOL_LIMITS } from "./limits";

export const GUILD_LIMITS = {
  /** One guild mutation per second per session. */
  actionCooldownMs: 1000,
  maxNameLength: 29,
  minNameLength: 3,
  maxMotdLength: 255,
  maxNickLength: 15,
  maxRankNameLength: 40,
  maxInvitesPerGuild: 100,
  /** Pending war declarations expire (lazily) after 72 hours. */
  warPendingExpiryMs: 72 * 3600 * 1000,
  maxFragLimit: 1000,
  /** Safety bound for the roster projection (project addition). */
  maxMembers: 500,
  /** Safety bound for the projected war list (project addition). */
  maxTrackedWars: 50,
} as const;

/**
 * Guild intents are fixed-size and covered by the shared 4096-byte /
 * 30-per-second transport caps; mutations are further limited to one per
 * second per session server-side. Membership, rank permissions, and war
 * state are all re-checked server-side at execution time inside the same
 * database transaction that applies the change.
 */

/** Founds a new guild; the sender becomes its leader. */
export const guildCreateMessageSchema = z
  .object({
    type: z.literal("guild-create"),
    name: z
      .string()
      .min(GUILD_LIMITS.minNameLength)
      .max(GUILD_LIMITS.maxNameLength),
  })
  .strict();

/** Vice+: invites one existing, guildless character by name. */
export const guildInviteMessageSchema = z
  .object({
    type: z.literal("guild-invite"),
    targetName: z.string().min(1).max(30),
  })
  .strict();

/** Accepts or declines one pending invitation from that guild. */
export const guildRespondInviteMessageSchema = z
  .object({
    type: z.literal("guild-respond-invite"),
    guildId: z.string().uuid(),
    accept: z.boolean(),
  })
  .strict();

/** Vice+: withdraws a pending invitation. */
export const guildRevokeInviteMessageSchema = z
  .object({
    type: z.literal("guild-revoke-invite"),
    targetCharacterId: z.string().min(1).max(192),
  })
  .strict();

/** Vice+: removes a member of strictly lower rank level. */
export const guildKickMessageSchema = z
  .object({
    type: z.literal("guild-kick"),
    targetCharacterId: z.string().min(1).max(192),
  })
  .strict();

/** Leaves the own guild; the leader must pass leadership or disband. */
export const guildLeaveMessageSchema = z
  .object({ type: z.literal("guild-leave") })
  .strict();

/** Leader-only: raises a member (rank 1) to vice-leader (rank 2). */
export const guildPromoteMessageSchema = z
  .object({
    type: z.literal("guild-promote"),
    targetCharacterId: z.string().min(1).max(192),
  })
  .strict();

/** Leader-only: lowers a vice-leader (rank 2) to member (rank 1). */
export const guildDemoteMessageSchema = z
  .object({
    type: z.literal("guild-demote"),
    targetCharacterId: z.string().min(1).max(192),
  })
  .strict();

/** Leader-only: hands the guild to another member. */
export const guildPassLeadershipMessageSchema = z
  .object({
    type: z.literal("guild-pass-leadership"),
    targetCharacterId: z.string().min(1).max(192),
  })
  .strict();

/** Leader-only: deletes the guild and everything attached to it. */
export const guildDisbandMessageSchema = z
  .object({ type: z.literal("guild-disband") })
  .strict();

/** Leader-only: sets the message of the day. */
export const guildSetMotdMessageSchema = z
  .object({
    type: z.literal("guild-set-motd"),
    motd: z.string().max(GUILD_LIMITS.maxMotdLength),
  })
  .strict();

/** Sets a member title; own nick always, any member's nick for the leader. */
export const guildSetNickMessageSchema = z
  .object({
    type: z.literal("guild-set-nick"),
    targetCharacterId: z.string().min(1).max(192),
    nick: z.string().max(GUILD_LIMITS.maxNickLength),
  })
  .strict();

/** Leader-only: renames one of the three fixed rank levels. */
export const guildSetRankNameMessageSchema = z
  .object({
    type: z.literal("guild-set-rank-name"),
    level: z.number().int().min(1).max(3),
    name: z.string().min(1).max(GUILD_LIMITS.maxRankNameLength),
  })
  .strict();

/** Requests the full own-guild projection (and pending invitations). */
export const guildOpenMessageSchema = z
  .object({ type: z.literal("guild-open") })
  .strict();

/** One guild chat line, delivered only to current members. */
export const guildChatMessageSchema = z
  .object({
    type: z.literal("guild-chat"),
    text: z.string().min(1).max(PROTOCOL_LIMITS.maxChatTextLength),
  })
  .strict();

/** Leader-only: declares war on another guild by name. */
export const guildDeclareWarMessageSchema = z
  .object({
    type: z.literal("guild-declare-war"),
    targetGuildName: z
      .string()
      .min(GUILD_LIMITS.minNameLength)
      .max(GUILD_LIMITS.maxNameLength),
    fragLimit: z.number().int().min(1).max(GUILD_LIMITS.maxFragLimit),
  })
  .strict();

/** Leader-only: accepts or rejects a pending war declaration. */
export const guildRespondWarMessageSchema = z
  .object({
    type: z.literal("guild-respond-war"),
    warId: z.string().uuid(),
    accept: z.boolean(),
  })
  .strict();

/** Leader-only: ends an active war (surrender; the other side wins). */
export const guildEndWarMessageSchema = z
  .object({
    type: z.literal("guild-end-war"),
    warId: z.string().uuid(),
  })
  .strict();

export const guildRankEntrySchema = z
  .object({
    level: z.number().int().min(1).max(3),
    name: z.string().min(1).max(GUILD_LIMITS.maxRankNameLength),
  })
  .strict();

export const guildMemberEntrySchema = z
  .object({
    characterId: z.string().min(1).max(192),
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    rankLevel: z.number().int().min(1).max(3),
    nick: z.string().max(GUILD_LIMITS.maxNickLength),
    online: z.boolean(),
  })
  .strict();

export const guildInviteEntrySchema = z
  .object({
    characterId: z.string().min(1).max(192),
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

export const guildWarStatusSchema = z.enum([
  "pending",
  "active",
  "rejected",
  "canceled",
  "ended",
]);

export const guildWarEntrySchema = z
  .object({
    warId: z.string().uuid(),
    enemyGuildName: z
      .string()
      .min(GUILD_LIMITS.minNameLength)
      .max(GUILD_LIMITS.maxNameLength),
    status: guildWarStatusSchema,
    fragLimit: z.number().int().min(1).max(GUILD_LIMITS.maxFragLimit),
    myKills: z.number().int().min(0).max(1_000_000),
    enemyKills: z.number().int().min(0).max(1_000_000),
    /** True when the own guild declared this war (drives accept/reject UI). */
    initiatedByUs: z.boolean(),
  })
  .strict();

/**
 * Full own-guild projection for one member. `invites` is present only for
 * vice-leaders and the leader (charter rule 6 — level 1 members may not see
 * the invite list).
 */
export const guildStateSchema = z
  .object({
    id: z.string().uuid(),
    name: z
      .string()
      .min(GUILD_LIMITS.minNameLength)
      .max(GUILD_LIMITS.maxNameLength),
    motd: z.string().max(GUILD_LIMITS.maxMotdLength),
    myRankLevel: z.number().int().min(1).max(3),
    ranks: z.array(guildRankEntrySchema).max(3),
    members: z.array(guildMemberEntrySchema).max(GUILD_LIMITS.maxMembers),
    invites: z
      .array(guildInviteEntrySchema)
      .max(GUILD_LIMITS.maxInvitesPerGuild)
      .optional(),
    wars: z.array(guildWarEntrySchema).max(GUILD_LIMITS.maxTrackedWars),
  })
  .strict();

export const guildInvitationEntrySchema = z
  .object({
    guildId: z.string().uuid(),
    guildName: z
      .string()
      .min(GUILD_LIMITS.minNameLength)
      .max(GUILD_LIMITS.maxNameLength),
    inviterName: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

/**
 * Own-guild projection; null clears it. `invitations` lists this player's
 * own pending guild invitations (only ever the recipient's own rows).
 */
export const guildStateMessageSchema = z
  .object({
    type: z.literal("guild-state"),
    guild: guildStateSchema.nullable(),
    invitations: z
      .array(guildInvitationEntrySchema)
      .max(GUILD_LIMITS.maxInvitesPerGuild),
  })
  .strict();

/** Sent to the invitee only. */
export const guildInvitationMessageSchema = guildInvitationEntrySchema
  .extend({ type: z.literal("guild-invitation") })
  .strict();

/** One delivered guild chat line; fans out only to current members. */
export const guildChatDeliveredMessageSchema = z
  .object({
    type: z.literal("guild-chat-delivered"),
    speakerId: z.string().min(1).max(192),
    speakerName: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    rankLevel: z.number().int().min(1).max(3),
    text: z.string().min(1).max(PROTOCOL_LIMITS.maxChatTextLength),
  })
  .strict();

/** Lightweight member broadcast for toasts; detail is a display name. */
export const guildEventMessageSchema = z
  .object({
    type: z.literal("guild-event"),
    kind: z.enum([
      "member-joined",
      "member-left",
      "member-kicked",
      "promoted",
      "demoted",
      "leadership-passed",
      "motd-changed",
      "war-declared",
      "war-accepted",
      "war-rejected",
      "war-ended",
      "disbanded",
    ]),
    detail: z.string().max(64).optional(),
  })
  .strict();

export const guildActionFailedMessageSchema = z
  .object({
    type: z.literal("guild-action-failed"),
    reason: z.enum([
      "name-taken",
      "invalid-name",
      "already-in-guild",
      "not-in-guild",
      "not-authorized",
      "target-not-found",
      "target-already-in-guild",
      "already-invited",
      "invite-not-found",
      "invite-limit",
      "target-not-member",
      "cannot-kick-higher-rank",
      "leader-cannot-leave",
      "guild-not-found",
      "war-not-found",
      "war-already-active",
      "cannot-war-own-guild",
      "rate-limited",
      "invalid-request",
    ]),
  })
  .strict();

export type GuildCreateMessage = z.infer<typeof guildCreateMessageSchema>;
export type GuildInviteMessage = z.infer<typeof guildInviteMessageSchema>;
export type GuildRespondInviteMessage = z.infer<
  typeof guildRespondInviteMessageSchema
>;
export type GuildRevokeInviteMessage = z.infer<
  typeof guildRevokeInviteMessageSchema
>;
export type GuildKickMessage = z.infer<typeof guildKickMessageSchema>;
export type GuildLeaveMessage = z.infer<typeof guildLeaveMessageSchema>;
export type GuildPromoteMessage = z.infer<typeof guildPromoteMessageSchema>;
export type GuildDemoteMessage = z.infer<typeof guildDemoteMessageSchema>;
export type GuildPassLeadershipMessage = z.infer<
  typeof guildPassLeadershipMessageSchema
>;
export type GuildDisbandMessage = z.infer<typeof guildDisbandMessageSchema>;
export type GuildSetMotdMessage = z.infer<typeof guildSetMotdMessageSchema>;
export type GuildSetNickMessage = z.infer<typeof guildSetNickMessageSchema>;
export type GuildSetRankNameMessage = z.infer<
  typeof guildSetRankNameMessageSchema
>;
export type GuildOpenMessage = z.infer<typeof guildOpenMessageSchema>;
export type GuildChatMessage = z.infer<typeof guildChatMessageSchema>;
export type GuildDeclareWarMessage = z.infer<
  typeof guildDeclareWarMessageSchema
>;
export type GuildRespondWarMessage = z.infer<
  typeof guildRespondWarMessageSchema
>;
export type GuildEndWarMessage = z.infer<typeof guildEndWarMessageSchema>;
export type GuildRankEntry = z.infer<typeof guildRankEntrySchema>;
export type GuildMemberEntry = z.infer<typeof guildMemberEntrySchema>;
export type GuildInviteEntry = z.infer<typeof guildInviteEntrySchema>;
export type GuildWarStatus = z.infer<typeof guildWarStatusSchema>;
export type GuildWarEntry = z.infer<typeof guildWarEntrySchema>;
export type GuildState = z.infer<typeof guildStateSchema>;
export type GuildInvitationEntry = z.infer<typeof guildInvitationEntrySchema>;
export type GuildStateMessage = z.infer<typeof guildStateMessageSchema>;
export type GuildInvitationMessage = z.infer<
  typeof guildInvitationMessageSchema
>;
export type GuildChatDeliveredMessage = z.infer<
  typeof guildChatDeliveredMessageSchema
>;
export type GuildEventMessage = z.infer<typeof guildEventMessageSchema>;
export type GuildEventKind = GuildEventMessage["kind"];
export type GuildActionFailedMessage = z.infer<
  typeof guildActionFailedMessageSchema
>;
export type GuildActionFailedReason = GuildActionFailedMessage["reason"];
