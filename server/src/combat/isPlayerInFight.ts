import type { Player } from "../Player";

/**
 * Canary's "in a fight" test (`isPzLocked() or CONDITION_INFIGHT`): the
 * combat lock any hit dealt or taken arms, or the protection-zone lock a
 * fight against a player leaves behind. Read from live conditions at
 * execution time, never from anything the client claimed.
 */
export function isPlayerInFight(player: Player, now: number): boolean {
  return (
    player.conditions.remainingMs("combat-lock", now) > 0 ||
    player.conditions.remainingMs("pz-lock", now) > 0
  );
}
