import { z } from "zod";
import type { CharacterVocation } from "./character";
import { starterVocationSchema } from "./character";

/**
 * Wheel of Destiny: 36 slices in 4 domains (quadrants), 5 rings.
 * The slice ids, costs, adjacency, and bonus tables mirror Canary's
 * server-side wheel data (src/creatures/players/components/wheel/).
 * The server is authoritative for every rule in this file; the client
 * uses the shared tables only for preview and rendering.
 */
export const WHEEL_LIMITS = {
  sliceCount: 36,
  maxSlicePoints: 200,
  /** 4 domains x 1000 points full capacity. */
  maxTotalPoints: 4000,
  minLevel: 51,
  /** One wheel read per session per this window. */
  readCooldownMs: 300,
  /** One wheel mutation per session per this window. */
  actionCooldownMs: 1_000,
} as const;

/** Domain order matches slice numbering: green TL, red TR, blue BL, purple BR. */
export const WHEEL_DOMAINS = ["green", "red", "blue", "purple"] as const;

export const wheelDomainSchema = z.enum(WHEEL_DOMAINS);

export type WheelDomain = z.infer<typeof wheelDomainSchema>;

/** Dedication perks scale per invested point. */
export type WheelDedicationKind =
  | "health"
  | "mana"
  | "capacity"
  | "mitigation"
  | "healthAndMana";

/**
 * Conviction perks activate only when a slice is completely full.
 * "resonance", "spell", and "special" are tracked and displayed but their
 * combat effects are a deferred increment (see TODO.md).
 */
export type WheelConvictionKind =
  | "skill"
  | "lifeLeech"
  | "manaLeech"
  | "resonance"
  | "spell"
  | "special";

export interface WheelSliceDefinition {
  readonly id: number;
  readonly domain: WheelDomain;
  /** 1 = innermost ring (the four 50-point roots), 5 = outermost. */
  readonly ring: 1 | 2 | 3 | 4 | 5;
  readonly maxPoints: 50 | 75 | 100 | 150 | 200;
  readonly dedication: WheelDedicationKind;
  readonly conviction: WheelConvictionKind;
}

/** Slice ids 1..36 in Canary's WheelSlots_t order (index = id - 1). */
export const WHEEL_SLICES: ReadonlyArray<WheelSliceDefinition> = [
  { id: 1, domain: "green", ring: 5, maxPoints: 200, dedication: "healthAndMana", conviction: "special" },
  { id: 2, domain: "green", ring: 4, maxPoints: 150, dedication: "mitigation", conviction: "manaLeech" },
  { id: 3, domain: "green", ring: 3, maxPoints: 100, dedication: "health", conviction: "resonance" },
  { id: 4, domain: "red", ring: 3, maxPoints: 100, dedication: "mana", conviction: "skill" },
  { id: 5, domain: "red", ring: 4, maxPoints: 150, dedication: "health", conviction: "resonance" },
  { id: 6, domain: "red", ring: 5, maxPoints: 200, dedication: "healthAndMana", conviction: "spell" },
  { id: 7, domain: "green", ring: 4, maxPoints: 150, dedication: "mitigation", conviction: "resonance" },
  { id: 8, domain: "green", ring: 3, maxPoints: 100, dedication: "health", conviction: "spell" },
  { id: 9, domain: "green", ring: 2, maxPoints: 75, dedication: "mana", conviction: "lifeLeech" },
  { id: 10, domain: "red", ring: 2, maxPoints: 75, dedication: "capacity", conviction: "resonance" },
  { id: 11, domain: "red", ring: 3, maxPoints: 100, dedication: "mana", conviction: "spell" },
  { id: 12, domain: "red", ring: 4, maxPoints: 150, dedication: "health", conviction: "manaLeech" },
  { id: 13, domain: "green", ring: 3, maxPoints: 100, dedication: "health", conviction: "spell" },
  { id: 14, domain: "green", ring: 2, maxPoints: 75, dedication: "mana", conviction: "skill" },
  { id: 15, domain: "green", ring: 1, maxPoints: 50, dedication: "capacity", conviction: "resonance" },
  { id: 16, domain: "red", ring: 1, maxPoints: 50, dedication: "mitigation", conviction: "spell" },
  { id: 17, domain: "red", ring: 2, maxPoints: 75, dedication: "capacity", conviction: "lifeLeech" },
  { id: 18, domain: "red", ring: 3, maxPoints: 100, dedication: "mana", conviction: "resonance" },
  { id: 19, domain: "blue", ring: 3, maxPoints: 100, dedication: "mitigation", conviction: "resonance" },
  { id: 20, domain: "blue", ring: 2, maxPoints: 75, dedication: "health", conviction: "manaLeech" },
  { id: 21, domain: "blue", ring: 1, maxPoints: 50, dedication: "mana", conviction: "spell" },
  { id: 22, domain: "purple", ring: 1, maxPoints: 50, dedication: "health", conviction: "resonance" },
  { id: 23, domain: "purple", ring: 2, maxPoints: 75, dedication: "mitigation", conviction: "skill" },
  { id: 24, domain: "purple", ring: 3, maxPoints: 100, dedication: "capacity", conviction: "spell" },
  { id: 25, domain: "blue", ring: 4, maxPoints: 150, dedication: "capacity", conviction: "lifeLeech" },
  { id: 26, domain: "blue", ring: 3, maxPoints: 100, dedication: "mitigation", conviction: "spell" },
  { id: 27, domain: "blue", ring: 2, maxPoints: 75, dedication: "health", conviction: "resonance" },
  { id: 28, domain: "purple", ring: 2, maxPoints: 75, dedication: "mitigation", conviction: "manaLeech" },
  { id: 29, domain: "purple", ring: 3, maxPoints: 100, dedication: "capacity", conviction: "spell" },
  { id: 30, domain: "purple", ring: 4, maxPoints: 150, dedication: "mana", conviction: "resonance" },
  { id: 31, domain: "blue", ring: 5, maxPoints: 200, dedication: "healthAndMana", conviction: "spell" },
  { id: 32, domain: "blue", ring: 4, maxPoints: 150, dedication: "capacity", conviction: "resonance" },
  { id: 33, domain: "blue", ring: 3, maxPoints: 100, dedication: "mitigation", conviction: "skill" },
  { id: 34, domain: "purple", ring: 3, maxPoints: 100, dedication: "capacity", conviction: "resonance" },
  { id: 35, domain: "purple", ring: 4, maxPoints: 150, dedication: "mana", conviction: "lifeLeech" },
  { id: 36, domain: "purple", ring: 5, maxPoints: 200, dedication: "healthAndMana", conviction: "special" },
];

/** The four ring-1 roots; always selectable without a full neighbor. */
export const WHEEL_ROOT_SLICES = [15, 16, 21, 22] as const;

/**
 * Undirected slice adjacency (Canary's connectivity graph; includes the
 * cross-domain seam edges). A non-root slice may hold points only while at
 * least one neighbor is completely full.
 */
export const WHEEL_EDGES: ReadonlyArray<readonly [number, number]> = [
  // green (TL)
  [15, 14], [15, 9],
  [9, 14], [9, 3], [9, 8],
  [14, 13], [14, 8],
  [13, 8], [13, 7],
  [8, 3], [8, 7], [8, 2],
  [3, 2],
  [2, 7], [2, 1],
  [7, 1],
  // red (TR)
  [16, 17], [16, 10],
  [17, 10], [17, 18], [17, 11],
  [10, 4], [10, 11],
  [4, 11], [4, 5],
  [11, 18], [11, 5], [11, 12],
  [18, 12],
  [12, 5], [12, 6],
  [5, 6],
  // blue (BL)
  [21, 20], [21, 27],
  [20, 27], [20, 19], [20, 26],
  [27, 26], [27, 33],
  [19, 26], [19, 25],
  [26, 25], [26, 32], [26, 33],
  [33, 32],
  [25, 32], [25, 31],
  [32, 31],
  // purple (BR)
  [22, 23], [22, 28],
  [23, 24], [23, 29],
  [28, 29], [28, 34],
  [24, 29], [24, 30],
  [29, 30], [29, 35],
  [34, 35],
  [30, 36],
  [35, 36],
  // cross-domain seams
  [9, 10], [3, 4],
  [14, 20], [13, 19],
  [17, 23], [18, 24],
  [28, 27], [34, 33],
];

const adjacency = new Map<number, number[]>();
for (const [a, b] of WHEEL_EDGES) {
  adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
  adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
}

export const WHEEL_ADJACENCY: ReadonlyMap<number, ReadonlyArray<number>> =
  adjacency;

/**
 * Minimum total allocated points before a slice of this ring may hold any
 * points (Canary's tier gates; ring 1 is always open).
 */
export const WHEEL_RING_POINT_GATES: Readonly<Record<2 | 3 | 4 | 5, number>> = {
  2: 50,
  3: 125,
  4: 225,
  5: 375,
};

/** Promotion points: one per level above 50. */
export const wheelPointsForLevel = (level: number): number =>
  Math.max(0, Math.floor(level) - 50);

export type WheelBaseVocation = z.infer<typeof starterVocationSchema>;

export const WHEEL_BASE_VOCATION: Readonly<
  Record<CharacterVocation, WheelBaseVocation>
> = {
  Knight: "Knight",
  "Elite Knight": "Knight",
  Paladin: "Paladin",
  "Royal Paladin": "Paladin",
  Sorcerer: "Sorcerer",
  "Master Sorcerer": "Sorcerer",
  Druid: "Druid",
  "Elder Druid": "Druid",
  Monk: "Monk",
  "Exalted Monk": "Monk",
};

/** Dedication gain per invested point, by base vocation. */
export const WHEEL_DEDICATION_RATES: Readonly<
  Record<
    WheelBaseVocation,
    { readonly health: number; readonly mana: number; readonly capacity: number }
  >
> = {
  Knight: { health: 3, mana: 1, capacity: 5 },
  Paladin: { health: 2, mana: 3, capacity: 4 },
  Sorcerer: { health: 1, mana: 6, capacity: 2 },
  Druid: { health: 1, mana: 6, capacity: 2 },
  Monk: { health: 2, mana: 2, capacity: 5 },
};

/** Mitigation multiplier gain per point, in percent (all vocations). */
export const WHEEL_MITIGATION_PER_POINT = 0.03;

/** Conviction values granted per fully-filled slice of the matching kind. */
export const WHEEL_CONVICTION_VALUES = {
  skillBoost: 1,
  lifeLeechPercent: 0.75,
  manaLeechPercent: 0.25,
} as const;

/** What the "+1 skill" conviction boosts, by base vocation. */
export const WHEEL_SKILL_BOOST_TARGET: Readonly<
  Record<WheelBaseVocation, "melee" | "distance" | "magic" | "fist">
> = {
  Knight: "melee",
  Paladin: "distance",
  Sorcerer: "magic",
  Druid: "magic",
  Monk: "fist",
};

/** Points invested in a domain to reach revelation stages 1/2/3. */
export const WHEEL_REVELATION_THRESHOLDS = [250, 500, 1000] as const;

/** Flat damage and healing granted per revelation stage reached (per domain). */
export const WHEEL_REVELATION_DAMAGE_HEALING = [4, 9, 20] as const;

/** Revelation perk display names per domain, by base vocation. */
export const WHEEL_REVELATION_PERKS: Readonly<
  Record<WheelDomain, Readonly<Record<WheelBaseVocation, string>>>
> = {
  green: {
    Knight: "Gift of Life",
    Paladin: "Gift of Life",
    Sorcerer: "Gift of Life",
    Druid: "Gift of Life",
    Monk: "Gift of Life",
  },
  red: {
    Knight: "Executioner's Throw",
    Paladin: "Divine Grenade",
    Sorcerer: "Beam Mastery",
    Druid: "Blessing of the Grove",
    Monk: "Spiritual Outburst",
  },
  blue: {
    Knight: "Combat Mastery",
    Paladin: "Divine Empowerment",
    Sorcerer: "Drain Body",
    Druid: "Twin Bursts",
    Monk: "Ascetic",
  },
  purple: {
    Knight: "Avatar of Steel",
    Paladin: "Avatar of Light",
    Sorcerer: "Avatar of Storm",
    Druid: "Avatar of Nature",
    Monk: "Avatar of Balance",
  },
};

/**
 * Display names for "spell" and "special" conviction slices, by base
 * vocation. Spell slices come in pairs granting the same augment; filling
 * both upgrades it (display-only for now).
 */
export const WHEEL_CONVICTION_NAMES: Readonly<
  Record<number, Readonly<Record<WheelBaseVocation, string>>>
> = {
  1: {
    Knight: "Battle Instinct",
    Paladin: "Positional Tactics",
    Sorcerer: "Runic Mastery",
    Druid: "Healing Link",
    Monk: "Guiding Presence",
  },
  36: {
    Knight: "Battle Healing",
    Paladin: "Ballistic Mastery",
    Sorcerer: "Focus Mastery",
    Druid: "Runic Mastery",
    Monk: "Sanctuary",
  },
  ...Object.fromEntries(
    [6, 21].map((id) => [
      id,
      {
        Knight: "Aug. Front Sweep",
        Paladin: "Aug. Sharpshooter",
        Sorcerer: "Aug. Focus Spells",
        Druid: "Aug. Strong Ice Wave",
        Monk: "Aug. Sweeping Takedown",
      },
    ]),
  ),
  ...Object.fromEntries(
    [8, 24].map((id) => [
      id,
      {
        Knight: "Aug. Groundshaker",
        Paladin: "Aug. Strong Ethereal Spear",
        Sorcerer: "Aug. Magic Shield",
        Druid: "Aug. Mass Healing",
        Monk: "Aug. Mass Spirit Mend",
      },
    ]),
  ),
  ...Object.fromEntries(
    [11, 26].map((id) => [
      id,
      {
        Knight: "Aug. Chivalrous Challenge",
        Paladin: "Aug. Divine Dazzle",
        Sorcerer: "Aug. Sap Strength",
        Druid: "Aug. Nature's Embrace",
        Monk: "Aug. Mystic Repulse",
      },
    ]),
  ),
  ...Object.fromEntries(
    [13, 29].map((id) => [
      id,
      {
        Knight: "Aug. Intense Wound Cleansing",
        Paladin: "Aug. Swift Foot",
        Sorcerer: "Aug. Energy Wave",
        Druid: "Aug. Terra Wave",
        Monk: "Aug. Chained Penance",
      },
    ]),
  ),
  ...Object.fromEntries(
    [16, 31].map((id) => [
      id,
      {
        Knight: "Aug. Fierce Berserk",
        Paladin: "Aug. Divine Caldera",
        Sorcerer: "Aug. Great Fire Wave",
        Druid: "Aug. Heal Friend",
        Monk: "Aug. Flurry of Blows",
      },
    ]),
  ),
};

const slicePointsSchema = z
  .number()
  .int()
  .min(0)
  .max(WHEEL_LIMITS.maxSlicePoints);

/** Fixed-size read intent; covered by the 4 KiB / 30-per-second caps. */
export const wheelGetMessageSchema = z
  .object({ type: z.literal("wheel-get") })
  .strict();

/**
 * Full allocation snapshot, index = slice id - 1. Fixed-size intent
 * (~500 bytes); the server re-validates every rule at execution time and
 * enforces WHEEL_LIMITS.actionCooldownMs per session.
 */
export const wheelSaveMessageSchema = z
  .object({
    type: z.literal("wheel-save"),
    /** Replay guard; a repeated id is answered with the current state. */
    requestId: z.string().uuid(),
    slices: z.array(slicePointsSchema).length(WHEEL_LIMITS.sliceCount),
  })
  .strict();

export const wheelStateMessageSchema = z
  .object({
    type: z.literal("wheel-state"),
    /** Points allocated per slice, index = slice id - 1. */
    slices: z.array(slicePointsSchema).length(WHEEL_LIMITS.sliceCount),
    /** Total promotion points this character has earned. */
    totalPoints: z
      .number()
      .int()
      .min(0)
      .max(WHEEL_LIMITS.maxTotalPoints),
    /** False while the character is below level 51 or not premium. */
    unlocked: z.boolean(),
  })
  .strict();

export const wheelActionFailedMessageSchema = z
  .object({
    type: z.literal("wheel-action-failed"),
    reason: z.enum(["rate-limited", "unavailable", "invalid-allocation"]),
  })
  .strict();

export type WheelGetMessage = z.infer<typeof wheelGetMessageSchema>;
export type WheelSaveMessage = z.infer<typeof wheelSaveMessageSchema>;
export type WheelStateMessage = z.infer<typeof wheelStateMessageSchema>;
export type WheelActionFailedMessage = z.infer<
  typeof wheelActionFailedMessageSchema
>;
export type WheelActionFailedReason = WheelActionFailedMessage["reason"];
