import type { Skill } from "@tibia/protocol";
import type { Item } from "../item/Item";
import { itemAffixesOf } from "./itemAffixesOf";

export interface PlayerAffixEffects {
  /** Flat weapon attack; wands add it to their damage band instead. */
  readonly attack: number;
  /** Flat defense joining the shield-block reduction like proficiency's. */
  readonly defense: number;
  /** Swing-interval reduction, capped so stacking cannot halve below 50%. */
  readonly attackSpeedPercent: number;
  readonly maxHealth: number;
  readonly maxMana: number;
  /** Always-on auto-attack leech, like imbuement leech. */
  readonly lifeLeechPercent: number;
  readonly manaLeechPercent: number;
  readonly criticalChancePercent: number;
  readonly criticalDamagePercent: number;
  readonly skills: Readonly<Partial<Record<Skill, number>>>;
  readonly magicLevel: number;
  /** Additive absorb percent per element, joining equipment absorbPercent. */
  readonly resistances: Readonly<Partial<Record<string, number>>>;
}

export const EMPTY_AFFIX_EFFECTS: PlayerAffixEffects = {
  attack: 0,
  defense: 0,
  attackSpeedPercent: 0,
  maxHealth: 0,
  maxMana: 0,
  lifeLeechPercent: 0,
  manaLeechPercent: 0,
  criticalChancePercent: 0,
  criticalDamagePercent: 0,
  skills: {},
  magicLevel: 0,
  resistances: {},
};

const ATTACK_SPEED_CAP_PERCENT = 50;
const LEECH_CAP_PERCENT = 100;

/**
 * Aggregates rolled rarity affixes across worn equipment into the numbers
 * combat and progression read at execution time, mirroring
 * playerImbuementEffects. Caps keep ten slots of legendary rolls from going
 * degenerate; per-affix values are already validated by itemAffixesOf.
 */
export function playerAffixEffects(
  equipment: ReadonlyArray<{ item: Item }>,
): PlayerAffixEffects {
  let attack = 0;
  let defense = 0;
  let attackSpeedPercent = 0;
  let maxHealth = 0;
  let maxMana = 0;
  let lifeLeechPercent = 0;
  let manaLeechPercent = 0;
  let criticalChancePercent = 0;
  let criticalDamagePercent = 0;
  const skills: Partial<Record<Skill, number>> = {};
  let magicLevel = 0;
  const resistances: Partial<Record<string, number>> = {};
  let any = false;
  for (const entry of equipment) {
    for (const affix of itemAffixesOf(entry.item)) {
      any = true;
      switch (affix.id) {
        case "attack":
          attack += affix.value;
          break;
        case "defense":
          defense += affix.value;
          break;
        case "attackSpeed":
          attackSpeedPercent += affix.value;
          break;
        case "maxHealth":
          maxHealth += affix.value;
          break;
        case "maxMana":
          maxMana += affix.value;
          break;
        case "lifeLeech":
          lifeLeechPercent += affix.value;
          break;
        case "manaLeech":
          manaLeechPercent += affix.value;
          break;
        case "critChance":
          criticalChancePercent += affix.value;
          break;
        case "critDamage":
          criticalDamagePercent += affix.value;
          break;
        case "skill":
          if (affix.skill) {
            skills[affix.skill] = (skills[affix.skill] ?? 0) + affix.value;
          }
          break;
        case "magicLevel":
          magicLevel += affix.value;
          break;
        case "resistance":
          if (affix.element) {
            resistances[affix.element] =
              (resistances[affix.element] ?? 0) + affix.value;
          }
          break;
      }
    }
  }
  if (!any) return EMPTY_AFFIX_EFFECTS;
  return {
    attack,
    defense,
    attackSpeedPercent: Math.min(attackSpeedPercent, ATTACK_SPEED_CAP_PERCENT),
    maxHealth,
    maxMana,
    lifeLeechPercent: Math.min(lifeLeechPercent, LEECH_CAP_PERCENT),
    manaLeechPercent: Math.min(manaLeechPercent, LEECH_CAP_PERCENT),
    criticalChancePercent,
    criticalDamagePercent,
    skills,
    magicLevel,
    resistances,
  };
}
