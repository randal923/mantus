import type { Monster } from "../creature/Monster";
import { computeBossRewardShares, type BossParticipantStats } from "./computeBossRewardShares";

interface TrackedContribution {
  damageIn: number;
  healing: number;
}

/**
 * Per-fight contribution tracking for reward bosses (Canary
 * reward_boss.lua/reward_chest.lua data inputs): damage taken from the boss
 * and healing given to fight participants accrue here; damage dealt lives on
 * the monster's own damage map. State is in-memory only — a fight that dies
 * with the server grants nothing, exactly like an unfinished fight.
 */
export class RewardBossTracker {
  private readonly statsByMonster = new Map<
    string,
    Map<string, TrackedContribution>
  >();

  onBossDamageTaken(monster: Monster, playerId: string, amount: number): void {
    if (amount <= 0) return;
    const stats = this.statsByMonster.get(monster.id) ?? new Map();
    this.statsByMonster.set(monster.id, stats);
    const entry = stats.get(playerId) ?? { damageIn: 0, healing: 0 };
    entry.damageIn += amount;
    stats.set(playerId, entry);
  }

  /**
   * Healing credits the healer when the healed player is already part of the
   * fight (dealt or took boss damage), mirroring reward_chest.lua:157-162.
   */
  onPlayerHealed(
    healerId: string,
    targetId: string,
    amount: number,
    liveBoss: (monsterId: string) => Monster | undefined,
  ): void {
    if (amount <= 0 || healerId === targetId) return;
    for (const [monsterId, stats] of this.statsByMonster) {
      const monster = liveBoss(monsterId);
      if (!monster) {
        this.statsByMonster.delete(monsterId);
        continue;
      }
      const targetInFight =
        stats.has(targetId) || monster.damageFrom(targetId) > 0;
      if (!targetInFight) continue;
      const entry = stats.get(healerId) ?? { damageIn: 0, healing: 0 };
      entry.healing += amount;
      stats.set(healerId, entry);
    }
  }

  /** Contribution shares for the dead boss; clears its tracking state. */
  sharesFor(monster: Monster): ReturnType<typeof computeBossRewardShares> {
    const tracked = this.statsByMonster.get(monster.id);
    this.statsByMonster.delete(monster.id);
    const byPlayer = new Map<string, BossParticipantStats>();
    for (const playerId of monster.damagerIds()) {
      byPlayer.set(playerId, {
        characterId: playerId,
        damageOut: monster.damageFrom(playerId),
        damageIn: tracked?.get(playerId)?.damageIn ?? 0,
        healing: tracked?.get(playerId)?.healing ?? 0,
      });
    }
    for (const [playerId, entry] of tracked ?? []) {
      if (byPlayer.has(playerId)) continue;
      byPlayer.set(playerId, {
        characterId: playerId,
        damageOut: 0,
        damageIn: entry.damageIn,
        healing: entry.healing,
      });
    }
    return computeBossRewardShares([...byPlayer.values()]);
  }

  release(monsterId: string): void {
    this.statsByMonster.delete(monsterId);
  }
}
