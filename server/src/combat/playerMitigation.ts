import type { FightMode } from "@tibia/protocol";
import { WHEEL_BASE_VOCATION, type WheelBaseVocation } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";
import { playerCombatSkill } from "./playerCombatSkill";

/**
 * Canary vocations.xml mitigation constants (pinned a879c931):
 * mitigationFactor / mitigationPrimaryShield / mitigationSecondaryShield.
 */
const MITIGATION_FACTORS: Readonly<
  Record<
    WheelBaseVocation,
    { readonly factor: number; readonly primary: number; readonly secondary: number }
  >
> = {
  Knight: { factor: 1.3, primary: 2.05, secondary: 1.25 },
  Paladin: { factor: 1.28, primary: 2.08, secondary: 1.2 },
  Sorcerer: { factor: 1.26, primary: 2.0, secondary: 1.2 },
  Druid: { factor: 1.26, primary: 2.0, secondary: 1.2 },
  Monk: { factor: 1.28, primary: 2.08, secondary: 1.2 },
};

const isSpellbookOrQuiver = (type: ItemType): boolean =>
  type.weaponType === "spellbook" ||
  type.primaryType === "spellbooks" ||
  type.primaryType === "quivers";

/** Combat Mastery's shield leg: +10/20/30 defense per blue stage. */
const COMBAT_MASTERY_DEFENSE = [10, 20, 30] as const;

const combatMasteryDefense = (player: Player): number => {
  if (WHEEL_BASE_VOCATION[player.vocation] !== "Knight") return 0;
  const stage = player.wheelBonuses.revelationStages.blue;
  if (stage < 1) return 0;
  return COMBAT_MASTERY_DEFENSE[Math.min(stage, 3) - 1] ?? 0;
};

/**
 * Canary's player mitigation percentage
 * (PlayerWheel::calculateMitigation, player_wheel.cpp:4033-4086): shielding
 * skill and held defense scaled by pinned vocation constants and fight mode,
 * then multiplied up by the Wheel of Destiny mitigation bonus. Applied to
 * every damage type except mana/life drain, after shield and armor blocks.
 * Everything here is read from server-owned state at execution time.
 */
export function playerMitigation(
  player: Player,
  equipment: ReadonlyArray<{ item: Item; type: ItemType }>,
  mode: FightMode["attack"],
): number {
  const constants = MITIGATION_FACTORS[WHEEL_BASE_VOCATION[player.vocation]];
  const skill = playerCombatSkill(player, equipment, "shielding");
  const fightFactor =
    mode === "offensive" ? 0.8 : mode === "defensive" ? 1.2 : 1.0;
  let shieldFactor = 1.0;
  let distanceFactor = 1.0;
  let defenseValue = 0;
  const shield = equipment.find(
    (entry) =>
      entry.item.location.kind === "equipment" &&
      entry.item.location.slot === "shield",
  );
  if (shield) {
    if (isSpellbookOrQuiver(shield.type)) {
      distanceFactor = constants.secondary;
    } else {
      shieldFactor = constants.primary;
    }
    defenseValue = shield.type.defense ?? 0;
    // Combat Mastery's one-handed leg (player_wheel.cpp:4065-4067).
    if (defenseValue > 0) {
      defenseValue += combatMasteryDefense(player);
    }
  }
  const weapon = equipment.find(
    (entry) =>
      entry.item.location.kind === "equipment" &&
      entry.item.location.slot === "weapon",
  );
  if (weapon) {
    if (weapon.type.ammoType === "bolt" || weapon.type.ammoType === "arrow") {
      distanceFactor = constants.secondary;
    } else if (weapon.type.slotType === "two-handed") {
      defenseValue =
        (weapon.type.defense ?? 0) + (weapon.type.extraDefense ?? 0);
      shieldFactor = constants.secondary;
    } else {
      defenseValue += weapon.type.extraDefense ?? 0;
      shieldFactor = constants.primary;
    }
  }
  const base =
    Math.ceil(
      ((skill * constants.factor + shieldFactor * defenseValue) / 100) *
        fightFactor *
        distanceFactor *
        100,
    ) / 100;
  return base + (base * player.wheelBonuses.mitigationPercent) / 100;
}
