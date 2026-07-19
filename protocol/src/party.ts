import { z } from "zod";
import { characterVocationSchema } from "./character";
import { PROTOCOL_LIMITS } from "./limits";

export const PARTY_LIMITS = {
  /** One party mutation per half second per session (project addition). */
  actionCooldownMs: 500,
  /** Total party size including the leader (Canary has no cap; safety bound). */
  maxMembers: 25,
  /** Pending invitations per party (Canary has no cap; safety bound). */
  maxPendingInvites: 16,
  /** Canary experienceShareRadiusX: status and shared exp reach 30 tiles. */
  statusRangeX: 30,
  /** Canary experienceShareRadiusY. */
  statusRangeY: 30,
  /** Canary experienceShareRadiusZ: one floor above or below the leader. */
  statusRangeFloors: 1,
} as const;

/**
 * Party intents are fixed-size and covered by the shared 4096-byte /
 * 30-per-second transport caps; mutations are further limited to one per
 * 500 ms per session server-side. Membership, leadership, limits, and the
 * shared-experience rules are all re-checked server-side at execution time.
 */

/** Invites one online player by name, creating a party when leaderless. */
export const partyInviteMessageSchema = z
  .object({
    type: z.literal("party-invite"),
    targetName: z
      .string()
      .min(1)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

/** Accepts or declines one pending invitation from that leader's party. */
export const partyRespondInviteMessageSchema = z
  .object({
    type: z.literal("party-respond-invite"),
    leaderId: z.string().min(1).max(192),
    accept: z.boolean(),
  })
  .strict();

/** Leader-only: withdraws a pending invitation. */
export const partyRevokeInviteMessageSchema = z
  .object({
    type: z.literal("party-revoke-invite"),
    targetPlayerId: z.string().min(1).max(192),
  })
  .strict();

/** Leaves the own party; blocked while in a fight outside protection zones. */
export const partyLeaveMessageSchema = z
  .object({ type: z.literal("party-leave") })
  .strict();

/** Leader-only: removes a member (project addition; Canary has no kick). */
export const partyKickMessageSchema = z
  .object({
    type: z.literal("party-kick"),
    targetPlayerId: z.string().min(1).max(192),
  })
  .strict();

/** Leader-only: hands leadership to another member. */
export const partyPassLeadershipMessageSchema = z
  .object({
    type: z.literal("party-pass-leadership"),
    targetPlayerId: z.string().min(1).max(192),
  })
  .strict();

/** Leader-only: toggles shared experience for the party. */
export const partySetSharedExpMessageSchema = z
  .object({
    type: z.literal("party-set-shared-exp"),
    enabled: z.boolean(),
  })
  .strict();

/** One party chat line, delivered only to current members. */
export const partyChatMessageSchema = z
  .object({
    type: z.literal("party-chat"),
    text: z.string().min(1).max(PROTOCOL_LIMITS.maxChatTextLength),
  })
  .strict();

export const partySharedExpStatusSchema = z.enum([
  "ok",
  "too-far-away",
  "level-spread",
  "inactive",
  "empty-party",
]);

/**
 * One member as seen by one recipient. healthPercent/manaPercent are null
 * whenever the member is outside the 30/30/1-floor status range of that
 * recipient (charter rule 6 — never send what the player cannot see).
 */
export const partyMemberEntrySchema = z
  .object({
    id: z.string().min(1).max(192),
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    level: z.number().int().min(1).max(100_000),
    vocation: characterVocationSchema,
    isLeader: z.boolean(),
    healthPercent: z.number().int().min(0).max(100).nullable(),
    manaPercent: z.number().int().min(0).max(100).nullable(),
    eligibleForSharedExp: z.boolean(),
  })
  .strict();

export const partyInvitedEntrySchema = z
  .object({
    id: z.string().min(1).max(192),
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

export const partyStateSchema = z
  .object({
    partyId: z.string().uuid(),
    leaderId: z.string().min(1).max(192),
    sharedExpActive: z.boolean(),
    sharedExpStatus: partySharedExpStatusSchema,
    members: z.array(partyMemberEntrySchema).max(PARTY_LIMITS.maxMembers),
    invited: z
      .array(partyInvitedEntrySchema)
      .max(PARTY_LIMITS.maxPendingInvites),
  })
  .strict();

/** Full own-party projection; null clears it. Sent only to members. */
export const partyStateMessageSchema = z
  .object({
    type: z.literal("party-state"),
    party: partyStateSchema.nullable(),
  })
  .strict();

/** Sent to the invitee only. */
export const partyInvitationMessageSchema = z
  .object({
    type: z.literal("party-invitation"),
    leaderId: z.string().min(1).max(192),
    leaderName: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    partyId: z.string().uuid(),
  })
  .strict();

/** Sent to the invitee when the invitation is withdrawn or void. */
export const partyInvitationRevokedMessageSchema = z
  .object({
    type: z.literal("party-invitation-revoked"),
    leaderId: z.string().min(1).max(192),
  })
  .strict();

/** One delivered party chat line; fans out only to current members. */
export const partyChatDeliveredMessageSchema = z
  .object({
    type: z.literal("party-chat-delivered"),
    speakerId: z.string().min(1).max(192),
    speakerName: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    text: z.string().min(1).max(PROTOCOL_LIMITS.maxChatTextLength),
  })
  .strict();

export const partyActionFailedMessageSchema = z
  .object({
    type: z.literal("party-action-failed"),
    reason: z.enum([
      "not-in-party",
      "not-leader",
      "target-not-found",
      "target-already-in-party",
      "already-invited",
      "invite-limit",
      "party-full",
      "not-invited",
      "target-not-member",
      "in-fight",
      "invalid-target",
      "rate-limited",
    ]),
  })
  .strict();

export type PartyInviteMessage = z.infer<typeof partyInviteMessageSchema>;
export type PartyRespondInviteMessage = z.infer<
  typeof partyRespondInviteMessageSchema
>;
export type PartyRevokeInviteMessage = z.infer<
  typeof partyRevokeInviteMessageSchema
>;
export type PartyLeaveMessage = z.infer<typeof partyLeaveMessageSchema>;
export type PartyKickMessage = z.infer<typeof partyKickMessageSchema>;
export type PartyPassLeadershipMessage = z.infer<
  typeof partyPassLeadershipMessageSchema
>;
export type PartySetSharedExpMessage = z.infer<
  typeof partySetSharedExpMessageSchema
>;
export type PartyChatMessage = z.infer<typeof partyChatMessageSchema>;
export type PartySharedExpStatus = z.infer<typeof partySharedExpStatusSchema>;
export type PartyMemberEntry = z.infer<typeof partyMemberEntrySchema>;
export type PartyInvitedEntry = z.infer<typeof partyInvitedEntrySchema>;
export type PartyState = z.infer<typeof partyStateSchema>;
export type PartyStateMessage = z.infer<typeof partyStateMessageSchema>;
export type PartyInvitationMessage = z.infer<
  typeof partyInvitationMessageSchema
>;
export type PartyInvitationRevokedMessage = z.infer<
  typeof partyInvitationRevokedMessageSchema
>;
export type PartyChatDeliveredMessage = z.infer<
  typeof partyChatDeliveredMessageSchema
>;
export type PartyActionFailedMessage = z.infer<
  typeof partyActionFailedMessageSchema
>;
export type PartyActionFailedReason = PartyActionFailedMessage["reason"];
