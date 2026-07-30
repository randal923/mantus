/** Canary `getSkillName`, keyed by the catalog's skill-modifier slugs. */
const SKILL_LOOK_NAMES: Readonly<Record<string, string>> = {
  axe: "axe fighting",
  club: "club fighting",
  dist: "distance fighting",
  fist: "fist fighting",
  shield: "shielding",
  sword: "sword fighting",
};

export function skillLookName(skill: string): string {
  return SKILL_LOOK_NAMES[skill] ?? skill;
}
