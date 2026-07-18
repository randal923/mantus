import type { Skill } from "@tibia/protocol";
import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";

export function playerCombatSkill(
  player: Player,
  equipment: ReadonlyArray<{ item: unknown; type: ItemType }>,
  skill: Skill,
): number {
  const modifierKey =
    skill === "distance"
      ? "dist"
      : skill === "shielding"
        ? "shield"
        : skill;
  const modifier = equipment.reduce(
    (total, entry) =>
      total +
      (modifierKey === "fishing"
        ? 0
        : (entry.type.skillModifiers?.[modifierKey] ?? 0)),
    0,
  );
  return Math.max(0, player.skillLevel(skill) + modifier);
}
