import type { Player } from "../Player";
import type { Session } from "../Session";

/**
 * Combat-facing surface of the PVP policy system. Every method reads live
 * state at call time inside the tick — targeting gates, damage-path
 * consequences, and death-path frag charging never act on stale relations.
 */
export interface PvpHooks {
  /** Targeting/harm gate re-run at execution time for every attack step. */
  canTarget(session: Session, attacker: Player, target: Player): boolean;
  /**
   * Called at damage execution for player-vs-player harm. Returns
   * "blocked" when the damage must be dropped (e.g. black-skull attacker
   * vs unmarked player); otherwise records aggression, applies the white
   * skull, and refreshes the in-fight window.
   */
  onPlayerAttack(attacker: Player, target: Player, now: number): "ok" | "blocked";
  /** Records damage dealt for most-damage kill attribution. */
  recordDamageTaken(
    victim: Player,
    attackerId: string,
    amount: number,
    now: number,
  ): void;
  /** Charges frags/sanctions for a player death; exactly once per eventId. */
  handlePlayerDeath(
    victim: Player,
    lastHitSourceId: string | null,
    deathEventId: string,
    now: number,
  ): void;
  /** Applies post-respawn overrides (black-skull crippled respawn). */
  applyRespawnState(player: Player): void;
}
