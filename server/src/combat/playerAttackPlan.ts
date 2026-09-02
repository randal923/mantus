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
import {
  EMPTY_PROFICIENCY_EFFECTS,
  type ProficiencyPerkEffects,
} from "../proficiency/ProficiencyPerkEffects";
import { playerSpecials, type PlayerSpecials } from "./playerSpecials";
import { playerTierBonuses } from "./playerTierBonuses";
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
    /** Weapon-tier onslaught chance (amplified), percent; +60% on proc. */
    readonly fatalChancePercent: number;
    /** Proficiency skill-percentage flat damage, added after the roll. */
    readonly flatBonusDamage: number;
    readonly proficiencyLifeLeechPercent: number;
    readonly proficiencyManaLeechPercent: number;
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
  proficiency: ProficiencyPerkEffects = EMPTY_PROFICIENCY_EFFECTS,
  now?: number,
): PlayerAttackPlan | null {
  const equipment = items.combatEquipment(player.id);
  const weapon = equipment.find(
    (entry) =>
      entry.item.location.kind === "equipment" &&
      entry.item.location.slot === "weapon",
  );
  const equipmentSpecials = playerSpecials(equipment, player, now);
  // Running imbuements add rolled criticals on top of the equipment stats
  // (Feature 78); their always-on leech rides the wheel-style leg in
  // PlayerAutoAttack so the equipment leech keeps its own chance roll.
  const imbuementSpecials = items.imbuementEffects(player.id);
  // Rolled rarity affixes join the same additive legs; their always-on leech
  // rides PlayerAutoAttack next to the imbuement leech.
  const affixes = items.affixEffects(player.id);
  const specials: PlayerSpecials = {
    ...equipmentSpecials,
    criticalChance:
      equipmentSpecials.criticalChance +
      imbuementSpecials.criticalChancePercent +
      affixes.criticalChancePercent +
      proficiency.criticalChancePercent,
    criticalDamagePercent:
      equipmentSpecials.criticalDamagePercent +
      imbuementSpecials.criticalDamagePercent +
      affixes.criticalDamagePercent +
      proficiency.criticalDamagePercent,
  };
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
          // A wand has no attack stat, so the +attack affix raises its
          // damage band instead of rolling dead.
          minimum: (type.minimumDamage ?? 1) + affixes.attack,
          maximum:
            (type.maximumDamage ?? type.minimumDamage ?? 1) + affixes.attack,
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
  // Proficiency flat attack joins the combined attack (weapons.cpp:646).
  let attack =
    (weapon ? (weapon.type.attack ?? 0) : 7) +
    proficiency.attackDamage +
    affixes.attack;
  const range =
    (distance ? (weapon?.type.range ?? 3) : 1) + proficiency.attackRange;
  let hitChanceType = weapon?.type;
  let hitChanceBonus = 0;
  let missileId = distance ? missileForItem(weapon?.type) : undefined;
  let consume: PlayerAttackPlan["consume"];
  if (distance && weapon?.type.ammoType) {
    // The arrow slot first, then the quiver in the shield hand (Canary reads
    // only the quiver; the arrow slot stays usable here).
    const ammunition =
      equipment.find(
        (entry) =>
          entry.item.location.kind === "equipment" &&
          entry.item.location.slot === "ammo" &&
          entry.type.weaponType === "ammunition" &&
          entry.type.ammoType === weapon.type.ammoType,
      ) ?? items.quiverAmmunition(player.id, weapon.type.ammoType);
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
  const imbuements = items.imbuementEffects(player.id);
  const skillLevel = playerCombatSkill(
    player,
    equipment,
    skill,
    (imbuements.skills[skill] ?? 0) +
      (affixes.skills[skill] ?? 0) +
      (proficiency.skills[skill] ?? 0),
  );
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
        }) +
          hitChanceBonus +
          proficiency.rangedHitChancePercent,
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
  // Elemental-damage imbuement: converts a share of the physical roll into
  // the imbued element — only the first one, only off a physical component
  // (Canary combat.cpp:833-874).
  if (imbuements.elementalDamage && shares[0] && shares[0] > 0) {
    const converted = shares[0] * (imbuements.elementalDamage.percent / 100);
    shares[0] -= converted;
    const damageType = protocolDamageType(
      imbuements.elementalDamage.element as CatalogDamageType,
    );
    shares.push(converted);
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
      fatalChancePercent: playerTierBonuses(equipment).fatalChancePercent,
      // Proficiency skill-percentage: a fraction of the weapon skill as
      // flat auto-attack damage, plus its always-on leech legs.
      flatBonusDamage: Math.floor(
        skillLevel * proficiency.skillPercentAutoAttack,
      ),
      proficiencyLifeLeechPercent: proficiency.lifeLeechPercent,
      proficiencyManaLeechPercent: proficiency.manaLeechPercent,
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
