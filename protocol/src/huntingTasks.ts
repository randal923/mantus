import { z } from "zod";

/**
 * Hunting tasks (Feature 75), transcribed from pinned Canary
 * src/io/ioprey.cpp (TaskHuntingSlot + IOPrey::initializeTaskHuntOptions).
 * Kill goals and point rewards are fixed content shared by server and client;
 * every mutation is server-validated at execution time.
 */
export const TASK_HUNTING_RULES = {
  slotCount: 3,
  gridSize: 9,
  /** Gold cost of a paid list reroll (and of Cancel) per character level. */
  rerollPricePerLevel: 200,
  /** Wildcards to open the full-list selection. */
  wildcardListPrice: 5,
  /** Wildcards per star (rarity) reroll. */
  starRerollPrice: 1,
  /** Post-claim slot exhaust (TASK_HUNTING_LIMIT_EXHAUST). */
  exhaustSeconds: 72_000,
  /** Cooldown until the next free list reroll. */
  freeRerollSeconds: 72_000,
  /** Kill-goal seed for the option table ("killStage", pinned constant). */
  killStage: 25,
  maxStars: 5,
  minPoolSize: 36,
} as const;

export const TASK_HUNTING_LIMITS = {
  maxPoolEntries: 2_000,
  maxMonsterNameLength: 64,
  /** One task mutation per 300 ms per session. */
  actionCooldownMs: 300,
  /** Kill counts keep incrementing past the goal; bound the wire value. */
  maxKills: 100_000,
} as const;

export const TASK_HUNTING_STATES = [
  "locked",
  "inactive",
  "selection",
  "list-selection",
  "active",
  "completed",
] as const;
export const taskHuntingStateSchema = z.enum(TASK_HUNTING_STATES);
export type TaskHuntingState = z.infer<typeof taskHuntingStateSchema>;

export const TASK_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const taskDifficultySchema = z.enum(TASK_DIFFICULTIES);
export type TaskDifficulty = z.infer<typeof taskDifficultySchema>;

/** Canary getTaskRewardOption: ≤1★ easy, 2-3★ medium, ≥4★ hard. */
export function taskDifficultyForStars(stars: number): TaskDifficulty {
  if (stars <= 1) return "easy";
  if (stars <= 3) return "medium";
  return "hard";
}

export interface TaskHuntingOption {
  readonly difficulty: TaskDifficulty;
  readonly rarity: number;
  readonly firstKills: number;
  readonly firstReward: number;
  readonly secondKills: number;
  readonly secondReward: number;
}

/**
 * The 15 goal/reward rows, computed with Canary's exact integer arithmetic
 * (ioprey.cpp:541-575): kills 25/100/400 by difficulty, reward escalating
 * per star by floor(reward * (115 + difficulty * 5) / 100).
 */
export const TASK_HUNTING_OPTIONS: ReadonlyArray<TaskHuntingOption> = (() => {
  const options: TaskHuntingOption[] = [];
  let kills = TASK_HUNTING_RULES.killStage;
  for (const [index, difficulty] of TASK_DIFFICULTIES.entries()) {
    let reward = Math.round(
      (10 * kills) / TASK_HUNTING_RULES.killStage,
    );
    for (let star = 1; star <= TASK_HUNTING_RULES.maxStars; star += 1) {
      options.push({
        difficulty,
        rarity: star,
        firstKills: kills,
        firstReward: reward,
        secondKills: kills * 2,
        secondReward: reward * 2,
      });
      reward = Math.floor((reward * (115 + (index + 1) * 5)) / 100);
    }
    kills *= 4;
  }
  return options;
})();

export function taskHuntingOptionFor(
  stars: number,
  rarity: number,
): TaskHuntingOption | undefined {
  const difficulty = taskDifficultyForStars(stars);
  return TASK_HUNTING_OPTIONS.find(
    (option) => option.difficulty === difficulty && option.rarity === rarity,
  );
}

const slotIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(TASK_HUNTING_RULES.slotCount - 1);
const raceIdSchema = z.number().int().min(1).max(65_535);

const taskMonsterSchema = z
  .object({
    raceId: raceIdSchema,
    name: z.string().min(1).max(TASK_HUNTING_LIMITS.maxMonsterNameLength),
    lookTypeId: z.number().int().min(0).max(65_535),
    stars: z.number().int().min(0).max(5),
    /** Bestiary completed for this race → the double goal may be chosen. */
    upgradeUnlocked: z.boolean(),
  })
  .strict();

export const taskHuntingSlotSchema = z
  .object({
    slot: slotIndexSchema,
    state: taskHuntingStateSchema,
    unlock: z.enum(["premium", "store"]).nullable(),
    grid: z.array(taskMonsterSchema).max(TASK_HUNTING_RULES.gridSize),
    selected: taskMonsterSchema.nullable(),
    /** Chasing the doubled second-tier goal. */
    upgrade: z.boolean(),
    rarity: z.number().int().min(1).max(TASK_HUNTING_RULES.maxStars),
    kills: z.number().int().min(0).max(TASK_HUNTING_LIMITS.maxKills),
    /** The active tier's goal and reward; null while nothing is selected. */
    goalKills: z.number().int().min(1).nullable(),
    goalPoints: z.number().int().min(1).nullable(),
    /** Seconds until the slot leaves its post-claim exhaust; 0 when free. */
    disabledForSeconds: z.number().int().min(0),
    freeRerollInSeconds: z.number().int().min(0),
  })
  .strict();
export type TaskHuntingSlot = z.infer<typeof taskHuntingSlotSchema>;

export const taskHuntingStateMessageSchema = z
  .object({
    type: z.literal("hunting-tasks-state"),
    slots: z.array(taskHuntingSlotSchema).length(TASK_HUNTING_RULES.slotCount),
    taskPoints: z.number().int().min(0),
    rerollPriceGold: z.number().int().min(0),
    listSelectionPool: z
      .array(taskMonsterSchema)
      .max(TASK_HUNTING_LIMITS.maxPoolEntries)
      .nullable(),
  })
  .strict();
export type TaskHuntingStateMessage = z.infer<
  typeof taskHuntingStateMessageSchema
>;

/**
 * Task mutations. One bounded shape for all actions (the outer message union
 * discriminates on `type`); the server checks per-action required fields and
 * re-validates state, exhaust, balances, and grid membership at execution
 * time inside the tick.
 */
export const taskHuntingActionMessageSchema = z
  .object({
    type: z.literal("hunting-task-action"),
    slot: slotIndexSchema,
    action: z.enum([
      "list-reroll",
      "star-reroll",
      "wildcard-list",
      "select-monster",
      "cancel",
      "claim",
    ]),
    /** select-monster: the chosen race. */
    raceId: raceIdSchema.optional(),
    /** select-monster: chase the doubled second-tier goal. */
    upgrade: z.boolean().optional(),
  })
  .strict();
export type TaskHuntingActionMessage = z.infer<
  typeof taskHuntingActionMessageSchema
>;

export const taskHuntingActionFailedMessageSchema = z
  .object({
    type: z.literal("hunting-task-action-failed"),
    reason: z.enum([
      "slot-locked",
      "exhausted",
      "not-selectable",
      "already-active",
      "duplicate-race",
      "insufficient-gold",
      "insufficient-wildcards",
      "goal-not-met",
      "invalid-request",
      "rate-limited",
    ]),
  })
  .strict();
export type TaskHuntingActionFailedMessage = z.infer<
  typeof taskHuntingActionFailedMessageSchema
>;
export type TaskHuntingActionFailedReason =
  TaskHuntingActionFailedMessage["reason"];
