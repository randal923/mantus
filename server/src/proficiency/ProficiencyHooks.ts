import type { Monster } from "../creature/Monster";
import type { ProficiencyPerkEffects } from "./ProficiencyPerkEffects";

/** Read-only proficiency view consumed by the combat paths (Feature 82). */
export interface ProficiencyHooks {
  /** Selected-perk effects of the wielded weapon, live at execution time. */
  effectsFor(characterId: string): ProficiencyPerkEffects;
  /** Powerful-foe gate: bosstiary bosses count alongside forge states. */
  isBoss(monster: Monster): boolean;
}
