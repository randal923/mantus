/**
 * Blessings (Feature 72), transcribed from the pinned Canary baseline
 * `a879c931`: `data/libs/systems/blessing.lua` (`Blessings.All`, the cost
 * formulas) and `src/creatures/players/player.cpp` (`Player::getLostPercent`).
 *
 * Typed data only — no Lua is executed. Prices are computed server-side from
 * the character's own level at execution time; nothing here reads a client
 * value.
 */

export type BlessingKind = "pvp" | "regular" | "enhanced";

export interface BlessingDefinition {
  readonly id: number;
  readonly name: string;
  readonly kind: BlessingKind;
  /**
   * Whether the blessing reduces death loss. Canary's `getLostPercent` counts
   * ids 2..8 only, so Twist of Fate protects the *other* blessings in PVP but
   * never discounts the penalty itself.
   */
  readonly reducesLoss: boolean;
  /** The charm item that grants it directly, if any. */
  readonly charmItemId?: number;
}

export const BLESSINGS: readonly BlessingDefinition[] = [
  { id: 1, name: "Twist of Fate", kind: "pvp", reducesLoss: false },
  {
    id: 2,
    name: "The Wisdom of Solitude",
    kind: "regular",
    reducesLoss: true,
    charmItemId: 10_345,
  },
  {
    id: 3,
    name: "The Spark of the Phoenix",
    kind: "regular",
    reducesLoss: true,
    charmItemId: 10_341,
  },
  {
    id: 4,
    name: "The Fire of the Suns",
    kind: "regular",
    reducesLoss: true,
    charmItemId: 10_344,
  },
  {
    id: 5,
    name: "The Spiritual Shielding",
    kind: "regular",
    reducesLoss: true,
    charmItemId: 10_343,
  },
  {
    id: 6,
    name: "The Embrace of Tibia",
    kind: "regular",
    reducesLoss: true,
    charmItemId: 10_342,
  },
  {
    id: 7,
    name: "Heart of the Mountain",
    kind: "enhanced",
    reducesLoss: true,
    charmItemId: 25_360,
  },
  {
    id: 8,
    name: "Blood of the Mountain",
    kind: "enhanced",
    reducesLoss: true,
    charmItemId: 25_361,
  },
] as const;

export const MIN_BLESSING_ID = 1;
export const MAX_BLESSING_ID = 8;

const BY_ID = new Map(BLESSINGS.map((blessing) => [blessing.id, blessing]));

export function blessingById(id: number): BlessingDefinition | undefined {
  return BY_ID.get(id);
}

export function isBlessingId(id: number): boolean {
  return Number.isInteger(id) && BY_ID.has(id);
}

/**
 * The persisted representation is Canary's bitmask: bit `id - 1` per blessing,
 * so the whole set is one small column and reads need no join.
 */
export function blessingMaskOf(ids: Iterable<number>): number {
  let mask = 0;
  for (const id of ids) {
    if (!isBlessingId(id)) throw new Error(`unknown blessing id ${id}`);
    mask |= 1 << (id - 1);
  }
  return mask;
}

export function hasBlessing(mask: number, id: number): boolean {
  if (!isBlessingId(id)) return false;
  return (mask & (1 << (id - 1))) !== 0;
}

export function blessingIdsOf(mask: number): number[] {
  return BLESSINGS.filter((blessing) => hasBlessing(mask, blessing.id)).map(
    (blessing) => blessing.id,
  );
}

/**
 * The count the death-loss formula uses. Canary iterates ids 2..8, so this
 * maxes out at 7 even for a character carrying all eight.
 */
export function lossReducingBlessingCount(mask: number): number {
  return BLESSINGS.filter(
    (blessing) => blessing.reducesLoss && hasBlessing(mask, blessing.id),
  ).length;
}

/**
 * Canary `Blessings.getBlessingCost`. Enhanced blessings (Heart/Blood of the
 * Mountain) cost more above level 30.
 */
export function getBlessingCost(level: number, enhanced: boolean): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error("level is out of range");
  }
  if (level <= 30) return 2000;
  if (level >= 120) {
    const base = enhanced ? 26_000 : 20_000;
    const multiplier = enhanced ? 100 : 75;
    return base + multiplier * (level - 120);
  }
  return (enhanced ? 260 : 200) * (level - 20);
}

/** Canary `Blessings.getPvpBlessingCost` — Twist of Fate has its own curve. */
export function getPvpBlessingCost(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error("level is out of range");
  }
  if (level <= 30) return 2000;
  if (level >= 270) return 50_000;
  return (level - 20) * 200;
}

/** The price of one blessing, picking the curve its kind uses. */
export function costOfBlessing(
  blessing: BlessingDefinition,
  level: number,
): number {
  if (blessing.kind === "pvp") return getPvpBlessingCost(level);
  return getBlessingCost(level, blessing.kind === "enhanced");
}

/**
 * Canary `Blessings.LossPercent[n].item` — the chance a given equipped item
 * drops on death, before the container/non-container split
 * (`calculateEquipmentLoss` divides by ten for non-containers). Five or more
 * blessings drop nothing at all.
 */
const EQUIPMENT_LOSS_CHANCE_PERCENT: readonly number[] = [
  100, 70, 45, 25, 10, 0, 0, 0, 0,
];

export function equipmentLossChancePercent(
  blessingCount: number,
  isContainer: boolean,
): number {
  if (
    !Number.isInteger(blessingCount) ||
    blessingCount < 0 ||
    blessingCount > MAX_BLESSING_ID
  ) {
    throw new Error("blessing count is out of range");
  }
  const chance = EQUIPMENT_LOSS_CHANCE_PERCENT[blessingCount] ?? 0;
  return isContainer ? chance : chance / 10;
}
