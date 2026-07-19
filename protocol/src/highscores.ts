import { z } from "zod";
import { characterVocationSchema } from "./character";
import { PROTOCOL_LIMITS } from "./limits";

export const HIGHSCORE_LIMITS = {
  pageSize: 50,
  /** Pages 0..19: the ranking is never queried deeper than 1000 rows. */
  maxPage: 19,
  maxRankDepth: 1000,
  /** Server-side cache TTL per (category, vocation, page) tuple. */
  cacheTtlMs: 10 * 60 * 1000,
  /** One highscore request per half second per session. */
  actionCooldownMs: 500,
} as const;

/**
 * Ranked categories the persisted character/progression schema actually
 * backs: experience (with level), magic level, and the seven trained
 * skills. Each maps to one fixed, parameterized read-model query.
 */
export const HIGHSCORE_CATEGORIES = [
  "experience",
  "magic",
  "fist",
  "club",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
] as const;

export const highscoreCategorySchema = z.enum(HIGHSCORE_CATEGORIES);

/**
 * Fixed-size read request against the bounded highscore read model; the
 * page is hard-capped so no client can walk the whole character table.
 */
export const highscoresGetMessageSchema = z
  .object({
    type: z.literal("highscores-get"),
    category: highscoreCategorySchema,
    vocation: characterVocationSchema.optional(),
    page: z.number().int().min(0).max(HIGHSCORE_LIMITS.maxPage),
  })
  .strict();

/** One public ranking row; never carries private character state. */
export const highscoreEntrySchema = z
  .object({
    rank: z.number().int().min(1).max(HIGHSCORE_LIMITS.maxRankDepth),
    name: z.string().min(1).max(PROTOCOL_LIMITS.maxCharacterNameLength),
    level: z.number().int().min(1).max(1000),
    vocation: characterVocationSchema,
    value: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const highscoresStateMessageSchema = z
  .object({
    type: z.literal("highscores-state"),
    category: highscoreCategorySchema,
    vocation: characterVocationSchema.optional(),
    page: z.number().int().min(0).max(HIGHSCORE_LIMITS.maxPage),
    totalPages: z
      .number()
      .int()
      .min(1)
      .max(HIGHSCORE_LIMITS.maxPage + 1),
    entries: z.array(highscoreEntrySchema).max(HIGHSCORE_LIMITS.pageSize),
  })
  .strict();

export const highscoresActionFailedMessageSchema = z
  .object({
    type: z.literal("highscores-action-failed"),
    reason: z.enum(["rate-limited", "invalid-request", "unavailable"]),
  })
  .strict();

export type HighscoreCategory = z.infer<typeof highscoreCategorySchema>;
export type HighscoresGetMessage = z.infer<typeof highscoresGetMessageSchema>;
export type HighscoreEntry = z.infer<typeof highscoreEntrySchema>;
export type HighscoresStateMessage = z.infer<
  typeof highscoresStateMessageSchema
>;
export type HighscoresActionFailedMessage = z.infer<
  typeof highscoresActionFailedMessageSchema
>;
export type HighscoresActionFailedReason =
  HighscoresActionFailedMessage["reason"];
