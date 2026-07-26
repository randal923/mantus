import { z } from "zod";

/**
 * Prey system (Feature 74), transcribed from pinned Canary
 * src/io/ioprey.cpp. All rules are server-enforced; these constants exist so
 * the client can display prices and the server and tests share one source.
 */
export const PREY_RULES = {
  slotCount: 3,
  gridSize: 9,
  /** Hunting time granted per activation/bonus reroll (PREY_BONUS_TIME). */
  bonusTimeSeconds: 7_200,
  /** Cooldown until the next free list reroll (PREY_FREE_REROLL_TIME). */
  freeRerollSeconds: 72_000,
  /** Gold cost of a paid list reroll per character level. */
  listRerollPricePerLevel: 200,
  /** Wildcards to open the full-list selection (PREY_SELECTION_LIST_PRICE). */
  wildcardListPrice: 5,
  /** Wildcards per bonus reroll (PREY_BONUS_REROLL_PRICE). */
  bonusRerollPrice: 1,
  /** Wildcards charged per expiry with the auto-reroll option. */
  autoRerollPrice: 1,
  /** Wildcards charged per expiry with the lock option. */
  lockPrice: 5,
  /** Store purchase cap on the wildcard balance. */
  maxWildcards: 50,
  /** Grids stay empty below this bestiary pool size (Canary guard). */
  minPoolSize: 36,
  maxBonusRarity: 10,
} as const;

export const PREY_LIMITS = {
  /** Full-list payload bound; the pool is the bestiary catalog. */
  maxPoolEntries: 2_000,
  maxMonsterNameLength: 64,
  /** One prey mutation per 300 ms per session. */
  actionCooldownMs: 300,
} as const;

export const PREY_SLOT_STATES = [
  "locked",
  "inactive",
  "active",
  "selection",
  "selection-change-monster",
  "list-selection",
] as const;
export const preySlotStateSchema = z.enum(PREY_SLOT_STATES);
export type PreySlotState = z.infer<typeof preySlotStateSchema>;

export const PREY_BONUS_TYPES = [
  "damage",
  "defense",
  "experience",
  "loot",
] as const;
export const preyBonusTypeSchema = z.enum(PREY_BONUS_TYPES);
export type PreyBonusType = z.infer<typeof preyBonusTypeSchema>;

export const PREY_OPTIONS = ["none", "auto-reroll", "lock"] as const;
export const preyOptionSchema = z.enum(PREY_OPTIONS);
export type PreyOption = z.infer<typeof preyOptionSchema>;

const slotIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(PREY_RULES.slotCount - 1);
const raceIdSchema = z.number().int().min(1).max(65_535);

const preyMonsterSchema = z
  .object({
    raceId: raceIdSchema,
    name: z.string().min(1).max(PREY_LIMITS.maxMonsterNameLength),
    lookTypeId: z.number().int().min(0).max(65_535),
  })
  .strict();

export const preyBonusSchema = z
  .object({
    type: preyBonusTypeSchema,
    rarity: z.number().int().min(1).max(PREY_RULES.maxBonusRarity),
    percentage: z.number().int().min(1).max(100),
  })
  .strict();

export const preySlotSchema = z
  .object({
    slot: slotIndexSchema,
    state: preySlotStateSchema,
    /** How a locked slot unlocks; only present while locked. */
    unlock: z.enum(["premium", "store"]).nullable(),
    grid: z.array(preyMonsterSchema).max(PREY_RULES.gridSize),
    selected: preyMonsterSchema.nullable(),
    /** Persisted across rerolls; null until the first activation. */
    bonus: preyBonusSchema.nullable(),
    bonusTimeLeftSeconds: z
      .number()
      .int()
      .min(0)
      .max(PREY_RULES.bonusTimeSeconds),
    /** 0 when the next list reroll is free. */
    freeRerollInSeconds: z.number().int().min(0),
    option: preyOptionSchema,
  })
  .strict();
export type PreySlot = z.infer<typeof preySlotSchema>;

/** Full prey projection for the session's own character. */
export const preyStateMessageSchema = z
  .object({
    type: z.literal("prey-state"),
    slots: z.array(preySlotSchema).length(PREY_RULES.slotCount),
    wildcards: z.number().int().min(0),
    /** Level-derived gold price of a paid list reroll. */
    listRerollPriceGold: z.number().int().min(0),
    /** The selectable pool; sent only while a slot is in list-selection. */
    listSelectionPool: z
      .array(preyMonsterSchema)
      .max(PREY_LIMITS.maxPoolEntries)
      .nullable(),
  })
  .strict();
export type PreyStateMessage = z.infer<typeof preyStateMessageSchema>;

/**
 * Prey mutations. One bounded shape for all actions (the outer message union
 * discriminates on `type`, so this cannot itself be a discriminated union);
 * the server checks the per-action required field and re-validates slot
 * state, balances, and grid/pool membership at execution time inside the
 * tick — indexes are bounds checked against the server's own grid, never
 * trusted.
 */
export const preyActionMessageSchema = z
  .object({
    type: z.literal("prey-action"),
    slot: slotIndexSchema,
    action: z.enum([
      "list-reroll",
      "bonus-reroll",
      "select-monster",
      "wildcard-list",
      "wildcard-select",
      "set-option",
    ]),
    /** select-monster: index into the server's own grid. */
    index: z
      .number()
      .int()
      .min(0)
      .max(PREY_RULES.gridSize - 1)
      .optional(),
    /** wildcard-select: race picked from the full list. */
    raceId: raceIdSchema.optional(),
    /** set-option. */
    option: preyOptionSchema.optional(),
  })
  .strict();
export type PreyActionMessage = z.infer<typeof preyActionMessageSchema>;

export const preyActionFailedMessageSchema = z
  .object({
    type: z.literal("prey-action-failed"),
    reason: z.enum([
      "slot-locked",
      "not-selectable",
      "already-active",
      "duplicate-race",
      "insufficient-gold",
      "insufficient-wildcards",
      "invalid-request",
      "rate-limited",
    ]),
  })
  .strict();
export type PreyActionFailedMessage = z.infer<
  typeof preyActionFailedMessageSchema
>;
export type PreyActionFailedReason = PreyActionFailedMessage["reason"];
