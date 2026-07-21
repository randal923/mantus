import { WHEEL_SLICES, type WheelBaseVocation, type WheelDomain } from "./wheel";

/**
 * Gem Atelier + Fragment Workshop (Wheel of Destiny extension).
 * All rules, cost tables, and mod ids mirror Canary
 * (src/creatures/players/components/wheel/): the server is authoritative
 * for every rule here; the client uses these tables for preview only.
 *
 * Deviations from Canary (see TODO.md): gems and fragments are tracked as
 * per-character balances instead of inventory items, and unrevealed gems
 * drop from bestiary/bosstiary kills instead of forge-classified monsters.
 */
export const GEM_QUALITIES = ["lesser", "regular", "greater"] as const;

export type GemQuality = (typeof GEM_QUALITIES)[number];

/** Elements a basic mod can grant resistance to (matches DamageType names). */
export type GemResistElement =
  | "physical"
  | "holy"
  | "death"
  | "fire"
  | "earth"
  | "ice"
  | "energy"
  | "mana-drain"
  | "life-drain";

export type GemBasicModEffect =
  | {
      readonly kind: "resistance";
      readonly element: GemResistElement;
      readonly percent: number;
      /** Weakness legs of a mod are flat; only positive legs scale. */
      readonly scalesWithGrade: boolean;
    }
  | { readonly kind: "mitigation"; readonly percent: number }
  | {
      readonly kind: "stat";
      readonly stat: "health" | "mana" | "capacity";
      /** Granted value = step x GEM_STAT_RATES[vocation][stat] / 100. */
      readonly step: number;
    };

export interface GemBasicModDefinition {
  readonly id: number;
  readonly tooltip: string;
  readonly effects: ReadonlyArray<GemBasicModEffect>;
}

export type GemSupremeModEffect =
  | { readonly kind: "dodge"; readonly percent: number }
  | { readonly kind: "critical-damage"; readonly percent: number }
  | { readonly kind: "life-leech"; readonly percent: number }
  | { readonly kind: "mana-leech"; readonly percent: number }
  | {
      readonly kind: "revelation";
      readonly domain: WheelDomain;
      readonly points: number;
    }
  | {
      /** Spell augments are displayed but have no combat effect yet (TODO.md). */
      readonly kind: "spell";
      readonly baseI?: number;
      readonly baseII?: number;
      readonly momentum: boolean;
    };

export interface GemSupremeModDefinition {
  readonly id: number;
  readonly name: string;
  readonly tooltip: string;
  readonly vocations: "all" | ReadonlyArray<WheelBaseVocation>;
  readonly effect: GemSupremeModEffect;
}

export const GEM_ATELIER_LIMITS = {
  /** Revealed gems a character may hold; destroy to make room (Canary cap). */
  maxRevealedGems: 225,
  /** One gem mutation per session per this window. */
  actionCooldownMs: 1_000,
  /** One gem state read per session per this window. */
  readCooldownMs: 300,
  maxGrade: 3,
} as const;

/** Gold cost to reveal an unrevealed gem of each quality. */
export const GEM_REVEAL_COSTS: Readonly<Record<GemQuality, number>> = {
  lesser: 125_000,
  regular: 1_000_000,
  greater: 6_000_000,
};

/** Gold cost to rotate a revealed gem's domain one step. */
export const GEM_SWITCH_DOMAIN_COSTS: Readonly<Record<GemQuality, number>> = {
  lesser: 125_000,
  regular: 250_000,
  greater: 500_000,
};

/**
 * Domain rotation applied by switch-domain (Canary's fixed 4-cycle
 * green -> red -> purple -> blue -> green); mods are untouched.
 */
export const GEM_DOMAIN_ROTATION: Readonly<Record<WheelDomain, WheelDomain>> = {
  green: "red",
  red: "purple",
  purple: "blue",
  blue: "green",
};

export interface GemGradeCost {
  readonly gold: number;
  readonly fragments: number;
}

/**
 * Fragment Workshop upgrade costs, index = current grade (0 -> 1, 1 -> 2,
 * 2 -> 3). Basic mods consume lesser fragments, supreme mods greater ones.
 */
export const GEM_GRADE_COSTS: Readonly<
  Record<"basic" | "supreme", ReadonlyArray<GemGradeCost>>
> = {
  basic: [
    { gold: 2_000_000, fragments: 5 },
    { gold: 5_000_000, fragments: 15 },
    { gold: 30_000_000, fragments: 30 },
  ],
  supreme: [
    { gold: 5_000_000, fragments: 5 },
    { gold: 12_000_000, fragments: 15 },
    { gold: 75_000_000, fragments: 30 },
  ],
};

/** Mod value multiplier by grade (0..3). */
export const GEM_GRADE_MULTIPLIERS = [1, 1.1, 1.2, 1.5] as const;

export interface GemDestroyYield {
  readonly fragment: "lesser" | "greater";
  readonly min: number;
  readonly max: number;
}

/** Fragments returned when destroying a revealed gem (uniform roll). */
export const GEM_DESTROY_YIELDS: Readonly<Record<GemQuality, GemDestroyYield>> =
  {
    lesser: { fragment: "lesser", min: 1, max: 5 },
    regular: { fragment: "lesser", min: 2, max: 10 },
    greater: { fragment: "greater", min: 1, max: 5 },
  };

/** Mods a revealed gem carries: lesser 1 basic, regular 2, greater 2 + supreme. */
export const GEM_BASIC_MOD_COUNT: Readonly<Record<GemQuality, 1 | 2>> = {
  lesser: 1,
  regular: 2,
  greater: 2,
};

/** Basic mod ids eligible for a gem's first mod slot (Canary slot-1 list). */
export const GEM_SLOT1_MOD_IDS: ReadonlyArray<number> = [
  3, 4, 5, 6, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 44, 45, 46, 47, 48,
];

/** Basic mod ids eligible for a gem's second mod slot (Canary slot-2 list). */
export const GEM_SLOT2_MOD_IDS: ReadonlyArray<number> = [
  0, 1, 2, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
  24, 25, 26, 27, 28, 29, 30,
];

/**
 * Per-vocation rates for stat-granting basic mods; value = step x rate / 100
 * (otclient bonusStep; matches Canary's getHealth/Mana/CapacityValue tables).
 */
export const GEM_STAT_RATES: Readonly<
  Record<
    WheelBaseVocation,
    { readonly health: number; readonly mana: number; readonly capacity: number }
  >
> = {
  Knight: { health: 300, mana: 100, capacity: 500 },
  Paladin: { health: 200, mana: 300, capacity: 400 },
  Sorcerer: { health: 100, mana: 600, capacity: 200 },
  Druid: { health: 100, mana: 600, capacity: 200 },
  Monk: { health: 200, mana: 200, capacity: 400 },
};

/** Display name of each vocation's gem family. */
export const GEM_VOCATION_NAMES: Readonly<Record<WheelBaseVocation, string>> = {
  Knight: "Guardian Gem",
  Paladin: "Marksman Gem",
  Sorcerer: "Sage Gem",
  Druid: "Mystic Gem",
  Monk: "Spiritualist Gem",
};

/**
 * Resonance-conviction slice ids per domain (3 each). A domain's vessel
 * resonance level = how many of these are filled to max; it gates how many
 * of the equipped gem's mods apply (1 = first basic, 2 = second, 3 = supreme).
 */
export const GEM_RESONANCE_SLICES: Readonly<
  Record<WheelDomain, ReadonlyArray<number>>
> = {
  green: WHEEL_SLICES.filter(
    (slice) => slice.domain === "green" && slice.conviction === "resonance",
  ).map((slice) => slice.id),
  red: WHEEL_SLICES.filter(
    (slice) => slice.domain === "red" && slice.conviction === "resonance",
  ).map((slice) => slice.id),
  blue: WHEEL_SLICES.filter(
    (slice) => slice.domain === "blue" && slice.conviction === "resonance",
  ).map((slice) => slice.id),
  purple: WHEEL_SLICES.filter(
    (slice) => slice.domain === "purple" && slice.conviction === "resonance",
  ).map((slice) => slice.id),
};
