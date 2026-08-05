import type { RolledAffix } from "./RolledAffix";

const SKILL_LABELS = {
  sword: "Sword Fighting",
  axe: "Axe Fighting",
  club: "Club Fighting",
  distance: "Distance Fighting",
  shielding: "Shielding",
} as const;

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Display line for one rolled affix, e.g. `+40 Maximum Health`. */
export function formatAffixText(affix: RolledAffix): string {
  switch (affix.id) {
    case "maxHealth":
      return `+${affix.value} Maximum Health`;
    case "maxMana":
      return `+${affix.value} Maximum Mana`;
    case "attackSpeed":
      return `+${affix.value}% Attack Speed`;
    case "attack":
      return `+${affix.value} Attack`;
    case "defense":
      return `+${affix.value} Defense`;
    case "lifeLeech":
      return `+${affix.value}% Life Leech`;
    case "manaLeech":
      return `+${affix.value}% Mana Leech`;
    case "critChance":
      return `+${affix.value}% Critical Hit Chance`;
    case "critDamage":
      return `+${affix.value}% Critical Extra Damage`;
    case "skill":
      return `+${affix.value} ${affix.skill ? SKILL_LABELS[affix.skill] : "Skill"}`;
    case "magicLevel":
      return `+${affix.value} Magic Level`;
    case "resistance":
      return `+${affix.value}% ${titleCase(affix.element ?? "Elemental")} Resistance`;
  }
}
