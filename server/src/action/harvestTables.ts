/**
 * Canary register_actions.lua harvest tables. Every cut transforms the map
 * item to a spent form whose catalog `decay` regrows it, and optionally drops
 * one yield stack on the tile — exactly what `Game.createItem(id, 1, toPosition)`
 * does there.
 */
export interface HarvestCut {
  readonly toTypeId: number;
  readonly yieldTypeId?: number;
}

/** onUseMachete: jungleGrass cuts, plus the shared reed cut. */
export const MACHETE_CUTS: ReadonlyMap<number, HarvestCut> = new Map([
  [3_696, { toTypeId: 3_695 }],
  [3_702, { toTypeId: 3_701 }],
  [17_153, { toTypeId: 17_151 }],
  [30_623, { toTypeId: 30_624, yieldTypeId: 30_975 }],
]);

/** onUseMachete: wildGrowth is removed outright rather than transformed. */
export const MACHETE_CLEARS: ReadonlySet<number> = new Set([
  2_130,
  3_635,
  30_224,
]);

/** onUseScythe: burning sugar cane, wheat, and reed. */
export const SCYTHE_CUTS: ReadonlyMap<number, HarvestCut> = new Map([
  [5_464, { toTypeId: 5_463, yieldTypeId: 5_466 }],
  [3_653, { toTypeId: 3_651, yieldTypeId: 3_605 }],
  [30_623, { toTypeId: 30_624, yieldTypeId: 30_975 }],
]);

/** sickle.lua: ripe sugar cane (5463, the stage burning cane decays into). */
export const SICKLE_CUTS: ReadonlyMap<number, HarvestCut> = new Map([
  [5_463, { toTypeId: 5_462, yieldTypeId: 5_466 }],
]);

/** onUsePick: the non-quest earth dig. */
export const PICK_DIGS: ReadonlyMap<number, HarvestCut> = new Map([
  [372, { toTypeId: 394 }],
]);

/**
 * onUsePick's crushable stone: a coin flip either produces fine gravel or
 * crushed stone that releases a frazzlemaw. The roll is server-side.
 */
export const PICK_CRUSH_STONE = {
  typeId: 20_135,
  gravelTypeId: 20_133,
  crushedTypeId: 20_134,
  monsterTypeId: "frazzlemaw",
  gravelChancePercent: 50,
  gravelMessage: "Crushing the stone produces some fine gravel.",
  crushedMessage:
    "Crushing the stone yields nothing but slightly finer, yet still unusable rubber.",
} as const;
