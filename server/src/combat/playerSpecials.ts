import type { ItemType } from "../item/ItemType";

export interface PlayerSpecials {
  readonly criticalChance: number;
  readonly criticalDamagePercent: number;
  readonly lifeLeechChance: number;
  readonly lifeLeechPercent: number;
  readonly manaLeechChance: number;
  readonly manaLeechPercent: number;
}

export function playerSpecials(
  equipment: ReadonlyArray<{ item: unknown; type: ItemType }>,
): PlayerSpecials {
  const criticalChance =
    equipment.reduce(
      (total, entry) => total + (entry.type.criticalHitChance ?? 0),
      0,
    ) / 100;
  const criticalDamagePercent =
    50 +
    equipment.reduce(
      (total, entry) => total + (entry.type.criticalHitDamage ?? 0),
      0,
    ) /
      100;
  const lifeLeechPercent =
    equipment.reduce(
      (total, entry) => total + (entry.type.lifeLeechAmount ?? 0),
      0,
    ) / 100;
  const manaLeechPercent =
    equipment.reduce(
      (total, entry) => total + (entry.type.manaLeechAmount ?? 0),
      0,
    ) / 100;
  return {
    criticalChance,
    criticalDamagePercent,
    lifeLeechChance: equipment.reduce(
      (total, entry) => total + (entry.type.lifeLeechChance ?? 0),
      0,
    ),
    lifeLeechPercent,
    manaLeechChance: equipment.reduce(
      (total, entry) => total + (entry.type.manaLeechChance ?? 0),
      0,
    ),
    manaLeechPercent,
  };
}
