import type { Monster } from "../creature/Monster";

/** Combat-side surface: credit a monster death to its damage participants. */
export interface BestiaryHooks {
  onMonsterKilled(
    damagerIds: ReadonlyArray<string>,
    monster: Monster,
    now: number,
  ): void;
}
