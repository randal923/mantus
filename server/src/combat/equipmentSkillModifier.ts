import type { Skill } from "@tibia/protocol";
import type { ItemType } from "../item/ItemType";

/**
 * The flat skill points equipped gear grants. Shared by the combat path and
 * the character panel's breakdown so the number a player sees and the number
 * a swing uses cannot drift apart.
 */
export function equipmentSkillModifier(
  equipment: ReadonlyArray<{ type: ItemType }>,
  skill: Skill,
): number {
  // Fishing has no equipment modifiers; the other two carry catalog aliases.
  if (skill === "fishing") return 0;
  const key =
    skill === "distance" ? "dist" : skill === "shielding" ? "shield" : skill;
  return equipment.reduce(
    (total, entry) => total + (entry.type.skillModifiers?.[key] ?? 0),
    0,
  );
}
