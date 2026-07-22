import type { Skill } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import { getVocation } from "../progression/getVocation";
import type { Session } from "../Session";
import type { CombatFormula } from "./CombatFormula";
import type { DamageRequest } from "./Damage";
import type { CatalogDamageType } from "./catalogDamageType";
import { damageTypeForElement } from "./damageTypeForElement";
import { effectForDamage } from "./effectForDamage";
import { meetsItemRequirements } from "./meetsItemRequirements";
import { missileForItem } from "./missileForItem";
import { playerCombatSkill } from "./playerCombatSkill";
import { playerSpecials, type PlayerSpecials } from "./playerSpecials";
import { protocolDamageType } from "./protocolDamageType";
import { skillForWeapon } from "./skillForWeapon";

export interface PlayerAttackPlan {
  readonly targetId: string;
  readonly range: number;
  readonly lineOfSight: boolean;
  readonly requests: ReadonlyArray<DamageRequest>;
  readonly training: {
    readonly skill: Skill;
    readonly kind: "melee" | "distance";
  } | null;
  readonly manaCost: number;
  readonly weaponRoll?: {
    readonly minimum: number;
    readonly maximum: number;
    readonly shares: ReadonlyArray<number>;
    readonly hitChance: number;
    readonly specials: PlayerSpecials;
  };
  readonly consume?: {
    readonly itemId: string;
    readonly revision: number;
    readonly reason: "ammunition" | "break";
  };
  readonly breakable?: {
    readonly itemId: string;
    readonly revision: number;
    readonly chance: number;
  };
}

export function playerAttackPlan(
  items: ItemIntentHandler,
  formula: CombatFormula,
  session: Session,
  player: Player,
  target: Creature,
): PlayerAttackPlan | null {
  const equipment = items.combatEquipment(player.id);
  const weapon = equipment.find(
    (entry) =>
      entry.item.location.kind === "equipment" &&
      entry.item.location.slot === "weapon",
  );
  const specials = playerSpecials(equipment);
  if (weapon && !meetsItemRequirements(player, weapon.type)) {
    return null;
  }
  if (weapon?.type.weaponType === "wand") {
    const type = weapon.type;
    const damageType = damageTypeForElement(type.wandType);
    return {
      targetId: target.id,
      range: type.range ?? 1,
      lineOfSight: true,
      training: null,
      manaCost: type.manaCost ?? 0,
      requests: [
        {
          sourceId: player.id,
          origin: "wand",
          type: damageType,
          minimum: type.minimumDamage ?? 1,
          maximum: type.maximumDamage ?? type.minimumDamage ?? 1,
          missileId: missileForItem(type),
          effectId: effectForDamage(damageType),
          ...specials,
          ignoreArmor: true,
          ignoreShield: true,
        },
      ],
    };
  }
  const weaponType = weapon?.type.weaponType;
  const distance = weaponType === "distance";
  const skill = skillForWeapon(weaponType);
  const vocation = getVocation(
    player.vocation,
    player.progression.definitionVersion,
  );
  // Canary: an unarmed fist attacks with value 7, but a weapon without an
  // attack stat (bow, crossbow) contributes 0 — the ammunition carries it.
  let attack = weapon ? (weapon.type.attack ?? 0) : 7;
  const range = distance ? (weapon?.type.range ?? 3) : 1;
  let hitChanceType = weapon?.type;
  let hitChanceBonus = 0;
  let missileId = distance ? missileForItem(weapon?.type) : undefined;
  let consume: PlayerAttackPlan["consume"];
  if (distance && weapon?.type.ammoType) {
    const ammunition = equipment.find(
      (entry) =>
        entry.item.location.kind === "equipment" &&
        entry.item.location.slot === "ammo" &&
        entry.type.weaponType === "ammunition" &&
        entry.type.ammoType === weapon.type.ammoType,
    );
    if (!ammunition || !meetsItemRequirements(player, ammunition.type)) {
      return null;
    }
    attack += ammunition.type.attack ?? 0;
    hitChanceType = ammunition.type;
    hitChanceBonus = weapon.type.hitChance ?? 0;
    missileId = missileForItem(ammunition.type) ?? missileId;
    consume = {
      itemId: ammunition.item.id,
      revision: ammunition.item.version,
      reason: "ammunition",
    };
  }
  const elementEntries = Object.entries(
    weapon?.type.elementDamage ?? {},
  ).filter((entry): entry is [CatalogDamageType, number] =>
    typeof entry[1] === "number" && entry[1] > 0
  );
  const elementAttack = elementEntries.reduce(
    (total, [, amount]) => total + amount,
    0,
  );
  const totalAttack = attack + elementAttack;
  const skillLevel = playerCombatSkill(player, equipment, skill);
  const rolled = distance
    ? formula.playerDistanceDamage({
        level: player.level,
        skill: skillLevel,
        attack: totalAttack,
        vocationMultiplier: vocation.formulas.distanceDamage,
        fightMode: session.fightMode.attack,
        targetIsPlayer: target instanceof Player,
        hasElement: elementAttack > 0,
      })
    : formula.playerMeleeDamage({
        level: player.level,
        skill: skillLevel,
        attack: totalAttack,
        vocationMultiplier: vocation.formulas.meleeDamage,
        fightMode: session.fightMode.attack,
        fist: !weapon,
      });
  const physicalRatio = totalAttack > 0 ? attack / totalAttack : 1;
  const hitChance = distance
    ? Math.min(
        100,
        formula.distanceHitChance({
          skill: skillLevel,
          distance: Math.max(
            Math.abs(player.position.x - target.position.x),
            Math.abs(player.position.y - target.position.y),
          ),
          ...(hitChanceType?.hitChance !== undefined
            ? { hitChance: hitChanceType.hitChance }
            : {}),
          ...(hitChanceType?.maxHitChance !== undefined
            ? { maxHitChance: hitChanceType.maxHitChance }
            : weapon?.type.ammoType
              ? { maxHitChance: 90 }
              : {}),
        }) + hitChanceBonus,
      )
    : 100;
  const requests: DamageRequest[] = [
    {
      sourceId: player.id,
      origin: distance ? "distance" : "melee",
      type: "physical",
      minimum: 0,
      maximum: 0,
      ...(missileId ? { missileId } : {}),
      effectId: 1,
    },
  ];
  const shares = [physicalRatio];
  for (const [type, amount] of elementEntries) {
    const damageType = protocolDamageType(type as CatalogDamageType);
    const ratio = totalAttack > 0 ? amount / totalAttack : 0;
    shares.push(ratio);
    requests.push({
      sourceId: player.id,
      origin: distance ? "distance" : "melee",
      type: damageType,
      minimum: 0,
      maximum: 0,
      effectId: effectForDamage(damageType),
      ignoreArmor: true,
      ignoreShield: true,
    });
  }
  return {
    targetId: target.id,
    range,
    lineOfSight: distance,
    requests,
    weaponRoll: {
      minimum: rolled.minimum,
      maximum: rolled.maximum,
      shares,
      hitChance,
      specials,
    },
    training: {
      skill,
      kind: distance ? "distance" : "melee",
    },
    manaCost: 0,
    ...(consume ? { consume } : {}),
    ...(distance && weapon?.type.breakChance
      ? {
          breakable: {
            itemId: weapon.item.id,
            revision: weapon.item.version,
            chance: weapon.type.breakChance,
          },
        }
      : {}),
  };
}
