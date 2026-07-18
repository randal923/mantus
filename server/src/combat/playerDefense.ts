import type { FightMode } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";
import { getVocation } from "../progression/getVocation";
import { playerCombatSkill } from "./playerCombatSkill";
import { skillForWeapon } from "./skillForWeapon";

export function playerDefense(
  player: Player,
  equipment: ReadonlyArray<{ item: Item; type: ItemType }>,
  mode: FightMode["attack"],
  now: number,
): number {
  const weapon = equipment.find(
    (entry) =>
      entry.item.location.kind === "equipment" &&
      entry.item.location.slot === "weapon",
  );
  const shield = equipment.find(
    (entry) =>
      entry.item.location.kind === "equipment" &&
      entry.item.location.slot === "shield",
  );
  let defenseSkill = playerCombatSkill(
    player,
    equipment,
    "fist",
  );
  let defenseValue = 7;
  let scaling = 0.15;
  if (weapon) {
    defenseSkill = playerCombatSkill(
      player,
      equipment,
      skillForWeapon(weapon.type.weaponType),
    );
    defenseValue =
      (weapon.type.defense ?? 0) + (weapon.type.extraDefense ?? 0);
    scaling = weapon.type.defense && weapon.type.defense > 0 ? 0.146 : 0.15;
  }
  if (shield) {
    defenseSkill = playerCombatSkill(
      player,
      equipment,
      "shielding",
    );
    defenseValue =
      (shield.type.defense ?? 0) + (weapon?.type.extraDefense ?? 0);
    scaling = 0.16;
  }
  const recentlyAttacked = now < player.nextAttackAt;
  const defenseFactor = recentlyAttacked
    ? mode === "offensive"
      ? 0.5
      : mode === "balanced"
        ? 0.75
        : 1
    : 1;
  const vocation = getVocation(
    player.vocation,
    player.progression.definitionVersion,
  );
  return Math.max(
    0,
    Math.floor(
      (defenseSkill / 4 + 2.23) *
        defenseValue *
        defenseFactor *
        scaling *
        vocation.formulas.defense,
    ),
  );
}
