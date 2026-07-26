import type { Monster } from "../creature/Monster";

/** Combat-side feeds for boss reward chests (Feature 84). */
export interface RewardHooks {
  /** Damage a reward boss dealt to a player (reward_chest.lua:163-166). */
  onBossDamageTaken(monster: Monster, playerId: string, amount: number): void;
  /** Player-to-player healing during a boss fight (reward_chest.lua:157-162). */
  onPlayerHealed(healerId: string, targetId: string, amount: number): void;
  /** Fires once per reward-boss death, inside the death tick. */
  onRewardBossDeath(monster: Monster, deathEventId: string, now: number): void;
}
