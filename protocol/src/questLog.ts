import { z } from "zod";

// Feature 104 — quest log. Shapes mirror pinned Canary's Lua-built packets
// (data/libs/functions/quests.lua:1158-1198, opcodes 0xF0/0xF1): the log
// lists only STARTED quests, a quest line only STARTED missions, and every
// evaluation runs server-side over the owner's own storages.

export const QUEST_LOG_LIMITS = {
  maxQuests: 600,
  maxMissions: 64,
  maxNameLength: 100,
  maxDescriptionLength: 1_000,
  /** One quest-log request per 300 ms per session. */
  requestCooldownMs: 300,
} as const;

export const questLogGetMessageSchema = z
  .object({ type: z.literal("quest-log-get") })
  .strict();

export const questLineGetMessageSchema = z
  .object({
    type: z.literal("quest-line-get"),
    questId: z.number().int().min(1).max(65_535),
  })
  .strict();

const questLogEntrySchema = z
  .object({
    questId: z.number().int().min(1).max(65_535),
    name: z.string().min(1).max(QUEST_LOG_LIMITS.maxNameLength),
    completed: z.boolean(),
  })
  .strict();
export type QuestLogEntry = z.infer<typeof questLogEntrySchema>;

/** Only the owner's started quests; never another character's state. */
export const questLogMessageSchema = z
  .object({
    type: z.literal("quest-log"),
    quests: z.array(questLogEntrySchema).max(QUEST_LOG_LIMITS.maxQuests),
  })
  .strict();

const questLineMissionSchema = z
  .object({
    missionId: z.number().int().min(0).max(65_535),
    name: z.string().min(1).max(QUEST_LOG_LIMITS.maxNameLength),
    completed: z.boolean(),
    /** May be empty: a few pinned states carry deliberately blank lines. */
    description: z.string().max(QUEST_LOG_LIMITS.maxDescriptionLength),
  })
  .strict();
export type QuestLineMission = z.infer<typeof questLineMissionSchema>;

export const questLineMessageSchema = z
  .object({
    type: z.literal("quest-line"),
    questId: z.number().int().min(1).max(65_535),
    name: z.string().min(1).max(QUEST_LOG_LIMITS.maxNameLength),
    missions: z.array(questLineMissionSchema).max(QUEST_LOG_LIMITS.maxMissions),
  })
  .strict();

export const questLogFailedMessageSchema = z
  .object({
    type: z.literal("quest-log-failed"),
    reason: z.enum(["invalid-request", "rate-limited"]),
  })
  .strict();
export type QuestLogFailedReason = z.infer<
  typeof questLogFailedMessageSchema
>["reason"];
