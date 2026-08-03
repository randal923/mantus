import { SKILLS, type Skill } from "@tibia/protocol";
import { equipmentSkillModifier } from "../combat/equipmentSkillModifier";
import type { PlayerImbuementEffects } from "../imbuement/playerImbuementEffects";
import type { ItemType } from "../item/ItemType";

/**
 * What equipped gear and its running imbuements contribute on top of the
 * character's own values. Skills reuse the very lookup the combat path calls,
 * so the panel can never claim a bonus a swing does not apply.
 *
 * Pure in its inputs: equipment arrays are memoized per inventory cache, so
 * this stays a cheap per-tick recomputation.
 */
export interface PlayerEquipmentBonuses {
  readonly skills: Readonly<Partial<Record<Skill, number>>>;
  readonly magicLevel: number;
  /** Flat walk speed from the item `speed` attribute plus Swiftness. */
  readonly speed: number;
}

export function playerEquipmentBonuses(
  equipment: ReadonlyArray<{ type: ItemType }>,
  imbuements: PlayerImbuementEffects,
): PlayerEquipmentBonuses {
  const skills: Partial<Record<Skill, number>> = {};
  for (const skill of SKILLS) {
    const bonus =
      equipmentSkillModifier(equipment, skill) + (imbuements.skills[skill] ?? 0);
    if (bonus !== 0) skills[skill] = bonus;
  }
  return {
    skills,
    magicLevel:
      equipment.reduce(
        (total, entry) => total + (entry.type.magicLevelPoints ?? 0),
        0,
      ) + imbuements.magicLevel,
    speed:
      equipment.reduce((total, entry) => total + (entry.type.speed ?? 0), 0) +
      imbuements.speed,
  };
}
