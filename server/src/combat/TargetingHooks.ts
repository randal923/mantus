import type { Creature } from "../creature/Creature";
import type { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import type { Player } from "../Player";

/**
 * Encounter-facing surface of the AI runtime. Every method resolves live
 * creatures at call time and returns false when the action is refused, so a
 * challenge or summon intent can never act on stale or forged state
 * (charter rules 1 and 4).
 */
export interface TargetingHooks {
  /** Canary `doChallengeCreature`: pins a monster onto the challenger. */
  challengeMonster(
    monster: Monster,
    challenger: Creature,
    now: number,
    durationMs: number,
  ): boolean;
  /** Canary `changeTargetDistance`: pulls a distance monster into melee. */
  pullMonsterToMelee(
    monster: Monster,
    distance: number,
    now: number,
    durationMs: number,
  ): boolean;
  /** True while the monster belongs to another creature (never challengeable). */
  isSummon(monster: Monster): boolean;
  /**
   * Summons one monster for a player, enforcing the shared global and
   * per-type summon limits. Returns the summon, or null when refused.
   */
  summonForPlayer(
    owner: Player,
    typeId: string,
    now: number,
  ): Monster | null;
  /** Current live summon count owned by this player. */
  playerSummonCount(ownerId: string): number;
  /**
   * Resolves a client-supplied creature name against the pinned catalog.
   * Names are matched case-insensitively and never used to index anything
   * directly — an unknown name simply returns undefined (charter rule 1).
   */
  findMonsterTypeByName(name: string): MonsterType | undefined;
}
