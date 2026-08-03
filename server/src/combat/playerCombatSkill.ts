import type { Skill } from "@tibia/protocol";
import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";
import { equipmentSkillModifier } from "./equipmentSkillModifier";

export function playerCombatSkill(
  player: Player,
  equipment: ReadonlyArray<{ item: unknown; type: ItemType }>,
  skill: Skill,
  /** Flat additions from running imbuements (Feature 78). */
  imbuementBoost = 0,
): number {
  return Math.max(
    0,
    player.skillLevel(skill) +
      equipmentSkillModifier(equipment, skill) +
      imbuementBoost,
  );
}
