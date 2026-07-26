import type { Skill } from "@tibia/protocol";
import type { ProficiencyPerk } from "./ProficiencyCatalog";

export interface ProficiencyPerkEffects {
  readonly attackDamage: number;
  readonly defenseBonus: number;
  readonly shieldModifier: number;
  readonly skills: Readonly<Partial<Record<Skill, number>>>;
  readonly magicLevel: number;
  /** Percent units for the combat formulas (JSON 0.02 -> 2). */
  readonly criticalChancePercent: number;
  readonly criticalDamagePercent: number;
  readonly lifeLeechPercent: number;
  readonly manaLeechPercent: number;
  /** Multiplier vs bosses and forge-state monsters (JSON 0.03 -> 3%). */
  readonly powerfulFoePercent: number;
  readonly rangedHitChancePercent: number;
  readonly attackRange: number;
  /** Fraction of the weapon skill added as flat auto-attack damage. */
  readonly skillPercentAutoAttack: number;
}

export const EMPTY_PROFICIENCY_EFFECTS: ProficiencyPerkEffects = {
  attackDamage: 0,
  defenseBonus: 0,
  shieldModifier: 0,
  skills: {},
  magicLevel: 0,
  criticalChancePercent: 0,
  criticalDamagePercent: 0,
  lifeLeechPercent: 0,
  manaLeechPercent: 0,
  powerfulFoePercent: 0,
  rangedHitChancePercent: 0,
  attackRange: 0,
  skillPercentAutoAttack: 0,
};

const COMBAT_SKILLS: ReadonlySet<string> = new Set([
  "fist",
  "club",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
]);

/**
 * Folds the selected perks of the wielded weapon into the numbers the
 * combat paths read (Feature 82). Perk families with no mantus mechanism
 * yet (spell augments, specialized magic level, bestiary damage, perfect
 * shot, gains on hit/kill, spell-percentage legs, and Canary's own dead
 * types 28-31) contribute nothing here — recorded residuals on Feature 82.
 */
export function proficiencyPerkEffects(
  perks: ReadonlyArray<ProficiencyPerk>,
): ProficiencyPerkEffects {
  if (perks.length === 0) return EMPTY_PROFICIENCY_EFFECTS;
  let attackDamage = 0;
  let defenseBonus = 0;
  let shieldModifier = 0;
  const skills: Partial<Record<Skill, number>> = {};
  let magicLevel = 0;
  let criticalChancePercent = 0;
  let criticalDamagePercent = 0;
  let lifeLeechPercent = 0;
  let manaLeechPercent = 0;
  let powerfulFoePercent = 0;
  let rangedHitChancePercent = 0;
  let attackRange = 0;
  let skillPercentAutoAttack = 0;
  for (const perk of perks) {
    switch (perk.type) {
      case "attack-damage":
        attackDamage += perk.value;
        break;
      case "defense-bonus":
        defenseBonus += perk.value;
        break;
      case "weapon-shield-modifier":
        shieldModifier += perk.value;
        break;
      case "skill-bonus":
        if (perk.skill === "magic") magicLevel += perk.value;
        else if (perk.skill && COMBAT_SKILLS.has(perk.skill)) {
          const skill = perk.skill as Skill;
          skills[skill] = (skills[skill] ?? 0) + perk.value;
        }
        break;
      case "critical-hit-chance":
      case "auto-attack-critical-hit-chance":
        criticalChancePercent += perk.value * 100;
        break;
      case "critical-extra-damage":
      case "auto-attack-critical-extra-damage":
        criticalDamagePercent += perk.value * 100;
        break;
      case "life-leech":
        lifeLeechPercent += perk.value * 100;
        break;
      case "mana-leech":
        manaLeechPercent += perk.value * 100;
        break;
      case "powerful-foe-bonus":
        powerfulFoePercent += perk.value * 100;
        break;
      case "ranged-hit-chance":
        rangedHitChancePercent += perk.value * 100;
        break;
      case "attack-range":
        attackRange += Math.round(perk.value);
        break;
      case "skill-percentage-auto-attack":
        skillPercentAutoAttack += perk.value;
        break;
      default:
        break;
    }
  }
  return {
    attackDamage,
    defenseBonus,
    shieldModifier,
    skills,
    magicLevel,
    criticalChancePercent,
    criticalDamagePercent,
    lifeLeechPercent,
    manaLeechPercent,
    powerfulFoePercent,
    rangedHitChancePercent,
    attackRange,
    skillPercentAutoAttack,
  };
}
