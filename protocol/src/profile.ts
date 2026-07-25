import { z } from "zod";
import { characterVocationSchema } from "./character";
import { PROTOCOL_LIMITS } from "./limits";

export const PROFILE_LIMITS = {
  maxAchievements: 500,
  maxTitles: 200,
  maxBadges: 100,
  maxIdLength: 64,
  maxNameLength: 64,
  maxDescriptionLength: 160,
  /** One profile lookup per second per session. */
  lookupCooldownMs: 1_000,
  /** Bug reports mirror the player-report limiter. */
  bugReportMinIntervalMs: 60_000,
  bugReportMaxPerDay: 20,
  maxBugReportLength: 500,
} as const;

const idSchema = z.string().min(1).max(PROFILE_LIMITS.maxIdLength);
const nameSchema = z.string().min(1).max(PROFILE_LIMITS.maxNameLength);

/** Requests one character's public profile by display name. */
export const characterProfileGetMessageSchema = z
  .object({
    type: z.literal("character-profile-get"),
    name: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
  })
  .strict();

/** Displays one of the character's own granted titles, or none with null. */
export const profileSelectTitleMessageSchema = z
  .object({
    type: z.literal("profile-select-title"),
    titleId: idSchema.nullable(),
  })
  .strict();

/** Ctrl+Z bug report; the server stamps the reporter and their position. */
export const bugReportMessageSchema = z
  .object({
    type: z.literal("bug-report"),
    category: z.enum(["bug", "typo", "map", "other"]),
    message: z.string().min(1).max(PROFILE_LIMITS.maxBugReportLength),
  })
  .strict();

export const achievementEntrySchema = z
  .object({
    achievementId: idSchema,
    name: nameSchema,
    description: z.string().max(PROFILE_LIMITS.maxDescriptionLength),
    grade: z.number().int().min(1).max(3),
    points: z.number().int().min(0).max(100),
    granted: z.boolean(),
  })
  .strict();

export const titleEntrySchema = z
  .object({
    titleId: idSchema,
    name: nameSchema,
    granted: z.boolean(),
  })
  .strict();

export const badgeEntrySchema = z
  .object({ badgeId: idSchema, name: nameSchema })
  .strict();

/**
 * The requester's own profile: every catalog achievement and title with a
 * granted flag, so the client can show progress. Private to its owner.
 */
export const profileStateMessageSchema = z
  .object({
    type: z.literal("profile-state"),
    achievements: z
      .array(achievementEntrySchema)
      .max(PROFILE_LIMITS.maxAchievements),
    titles: z.array(titleEntrySchema).max(PROFILE_LIMITS.maxTitles),
    badges: z.array(badgeEntrySchema).max(PROFILE_LIMITS.maxBadges),
    selectedTitle: idSchema.nullable(),
    points: z.number().int().min(0),
  })
  .strict();

/**
 * A public character profile. Deliberately narrow: name, level, vocation,
 * guild, and the *granted* achievements/titles/badges. No position, no
 * inventory, no hidden stats — this is a board, not a tracker
 * (charter rule 6).
 */
export const characterProfileMessageSchema = z
  .object({
    type: z.literal("character-profile"),
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    level: z.number().int().min(1),
    vocation: characterVocationSchema,
    guildName: z.string().max(29).nullable(),
    title: nameSchema.nullable(),
    points: z.number().int().min(0),
    achievements: z
      .array(achievementEntrySchema)
      .max(PROFILE_LIMITS.maxAchievements),
    badges: z.array(badgeEntrySchema).max(PROFILE_LIMITS.maxBadges),
  })
  .strict();

/** Push for a freshly granted achievement; only to its owner. */
export const achievementGrantedMessageSchema = z
  .object({
    type: z.literal("achievement-granted"),
    achievementId: idSchema,
    name: nameSchema,
    points: z.number().int().min(0).max(100),
  })
  .strict();

export const profileActionFailedMessageSchema = z
  .object({
    type: z.literal("profile-action-failed"),
    reason: z.enum([
      "not-found",
      "not-granted",
      "rate-limited",
      "invalid-request",
    ]),
  })
  .strict();

export type CharacterProfileGetMessage = z.infer<
  typeof characterProfileGetMessageSchema
>;
export type ProfileSelectTitleMessage = z.infer<
  typeof profileSelectTitleMessageSchema
>;
export type BugReportMessage = z.infer<typeof bugReportMessageSchema>;
export type AchievementEntry = z.infer<typeof achievementEntrySchema>;
export type TitleEntry = z.infer<typeof titleEntrySchema>;
export type BadgeEntry = z.infer<typeof badgeEntrySchema>;
export type ProfileStateMessage = z.infer<typeof profileStateMessageSchema>;
export type CharacterProfileMessage = z.infer<
  typeof characterProfileMessageSchema
>;
export type AchievementGrantedMessage = z.infer<
  typeof achievementGrantedMessageSchema
>;
export type ProfileActionFailedMessage = z.infer<
  typeof profileActionFailedMessageSchema
>;
export type ProfileActionFailedReason =
  ProfileActionFailedMessage["reason"];
