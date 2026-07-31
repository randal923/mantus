import { z } from "zod";
import { boostedStateMessageSchema } from "./boosted";
import {
  characterOutfitSchema,
  characterSexSchema,
  characterVocationSchema,
} from "./character";
import { CYCLOPEDIA_LIMITS } from "./cyclopedia";
import {
  HIGHSCORE_LIMITS,
  highscoreCategorySchema,
  highscoreEntrySchema,
} from "./highscores";
import { PROTOCOL_LIMITS } from "./limits";
import { achievementEntrySchema, badgeEntrySchema } from "./profile";

export const PUBLIC_WEBSITE_LIMITS = {
  landingHighscoreEntries: 5,
  onlinePlayers: 1_000,
  profileAchievements: 5,
  profileBadges: 10,
  cacheEntries: 128,
  landingCacheTtlMs: 30_000,
  liveCacheTtlMs: 5_000,
  databaseCacheTtlMs: 60_000,
} as const;

export const publicLandingDataSchema = z
  .object({
    status: z.literal("online"),
    worldName: z.string().min(1).max(100),
    playersOnline: z.number().int().min(0).max(100_000),
    generatedAt: z.string().datetime(),
    boosted: boostedStateMessageSchema.pick({
      creature: true,
      boss: true,
    }),
    highscores: z
      .array(highscoreEntrySchema)
      .max(PUBLIC_WEBSITE_LIMITS.landingHighscoreEntries),
  })
  .strict();

export const publicHighscoresQuerySchema = z
  .object({
    category: highscoreCategorySchema.default("experience"),
    vocation: characterVocationSchema.optional(),
    page: z.coerce
      .number()
      .int()
      .min(0)
      .max(HIGHSCORE_LIMITS.maxPage)
      .default(0),
  })
  .strict();

export const publicHighscoresDataSchema = z
  .object({
    category: highscoreCategorySchema,
    vocation: characterVocationSchema.nullable(),
    page: z.number().int().min(0).max(HIGHSCORE_LIMITS.maxPage),
    totalPages: z.number().int().min(1).max(HIGHSCORE_LIMITS.maxPage + 1),
    entries: z.array(highscoreEntrySchema).max(HIGHSCORE_LIMITS.pageSize),
    generatedAt: z.string().datetime(),
  })
  .strict();

export const publicOnlinePlayerSchema = z
  .object({
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    level: z.number().int().min(1).max(1_000),
    vocation: characterVocationSchema,
    guildName: z.string().max(29).nullable(),
  })
  .strict();

export const publicOnlineDataSchema = z
  .object({
    playersOnline: z.number().int().min(0).max(100_000),
    players: z
      .array(publicOnlinePlayerSchema)
      .max(PUBLIC_WEBSITE_LIMITS.onlinePlayers),
    generatedAt: z.string().datetime(),
  })
  .strict();

export const publicCharacterProfileDataSchema = z
  .object({
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    level: z.number().int().min(1).max(1_000),
    vocation: characterVocationSchema,
    sex: characterSexSchema,
    outfit: characterOutfitSchema,
    worldName: z.string().min(1).max(100),
    residence: z.string().min(1).max(100),
    guildName: z.string().max(29).nullable(),
    title: z.string().max(64).nullable(),
    achievementPoints: z.number().int().min(0),
    achievements: z
      .array(achievementEntrySchema)
      .max(PUBLIC_WEBSITE_LIMITS.profileAchievements),
    badges: z
      .array(badgeEntrySchema)
      .max(PUBLIC_WEBSITE_LIMITS.profileBadges),
    createdAt: z.string().datetime(),
    lastLoginAt: z.string().datetime().nullable(),
    deathHistory: z
      .array(
        z
          .object({
            occurredAt: z.string().datetime(),
            level: z.number().int().min(1).max(1_000),
            cause: z
              .string()
              .min(1)
              .max(CYCLOPEDIA_LIMITS.maxCauseLength),
          })
          .strict(),
      )
      .max(CYCLOPEDIA_LIMITS.pageSize),
    online: z.boolean(),
    generatedAt: z.string().datetime(),
  })
  .strict();

export const publicServerInfoDataSchema = z
  .object({
    worldName: z.string().min(1).max(100),
    status: z.literal("online"),
    playersOnline: z.number().int().min(0).max(100_000),
    maxPlayers: z.number().int().positive().max(100_000),
    pvpType: z.literal("open-pvp"),
    rates: z
      .object({
        experience: z.number().min(0).max(10_000),
        skill: z.number().min(0).max(10_000),
        magic: z.number().min(0).max(10_000),
        loot: z.number().min(0).max(10_000),
        spawn: z.number().min(0).max(10_000),
        soulRegen: z.number().min(0).max(10_000),
        offlineTraining: z.number().min(0).max(10_000),
        exerciseTraining: z.number().min(0).max(10_000),
      })
      .strict(),
    systems: z
      .object({
        stamina: z.boolean(),
        experienceStages: z.boolean(),
        market: z.boolean(),
        houses: z.boolean(),
        guildWars: z.boolean(),
        dailyRewards: z.boolean(),
      })
      .strict(),
    startedAt: z.string().datetime(),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type PublicLandingData = z.infer<typeof publicLandingDataSchema>;
export type PublicHighscoresQuery = z.infer<
  typeof publicHighscoresQuerySchema
>;
export type PublicHighscoresData = z.infer<
  typeof publicHighscoresDataSchema
>;
export type PublicOnlinePlayer = z.infer<typeof publicOnlinePlayerSchema>;
export type PublicOnlineData = z.infer<typeof publicOnlineDataSchema>;
export type PublicCharacterProfileData = z.infer<
  typeof publicCharacterProfileDataSchema
>;
export type PublicServerInfoData = z.infer<
  typeof publicServerInfoDataSchema
>;
