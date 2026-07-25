/**
 * Canary data/scripts/movements/special_tiles.lua: pressure plates depress on
 * step-in and rise again on step-out. Both directions are needed so a plate
 * left depressed by a disconnect cannot stay stuck.
 */
export const PRESSURE_PLATE_DEPRESS: ReadonlyMap<number, number> = new Map([
  [419, 420],
  [431, 430],
  [452, 453],
  [563, 564],
  [549, 562],
  [10_145, 10_146],
]);

export const PRESSURE_PLATE_RELEASE: ReadonlyMap<number, number> = new Map([
  [420, 419],
  [430, 431],
  [453, 452],
  [564, 563],
  [562, 549],
  [10_146, 10_145],
]);

/**
 * Canary data/scripts/movements/trap.lua. `damage` is the physical (or typed)
 * hit dealt on step-in; `transformTo` arms/springs the trap graphic and its
 * reverse is the step-out transform. `ignorePlayers` traps only bite monsters.
 */
export interface TrapDefinition {
  readonly transformTo?: number;
  readonly damage?: { readonly minimum: number; readonly maximum: number };
  readonly damageType?: "earth";
  readonly ignorePlayers?: boolean;
}

export const TRAP_TILES: ReadonlyMap<number, TrapDefinition> = new Map([
  [2_145, { transformTo: 2_146, damage: { minimum: 50, maximum: 100 } }],
  [2_148, { damage: { minimum: 50, maximum: 100 } }],
  [3_482, { transformTo: 3_481, damage: { minimum: 15, maximum: 30 } }],
  [
    3_944,
    {
      transformTo: 3_945,
      damage: { minimum: 15, maximum: 30 },
      damageType: "earth",
    },
  ],
  [12_368, { ignorePlayers: true }],
]);

/** Sprung traps that re-arm when the tile is left (Canary's `id - 1`). */
export const TRAP_RELEASE: ReadonlyMap<number, number> = new Map([
  [2_146, 2_145],
  [3_945, 3_944],
]);
