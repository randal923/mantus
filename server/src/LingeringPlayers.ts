import type { Player } from "./Player";

/** Combat locks carried across a reconnect so relogging cannot shed them. */
export interface CarriedCombatLocks {
  readonly combatLockMs: number;
  readonly pzLockMs: number;
}

/**
 * Characters whose socket closed while a combat lock was active. Canary keeps
 * such a character in the world until the lock expires, so a killer cannot log
 * out before their victim dies and escape the frag and skull.
 *
 * The Player entity stays in the world and keeps ticking without input; only
 * the session-scoped systems are detached. Expiry, death, and reconnection all
 * funnel through `retire`, which the caller wires to the normal leave path.
 */
export class LingeringPlayers {
  private readonly byCharacterId = new Map<string, Player>();

  /** True when this character is currently lingering without a socket. */
  has(characterId: string): boolean {
    return this.byCharacterId.has(characterId);
  }

  add(player: Player): void {
    this.byCharacterId.set(player.id, player);
  }

  /**
   * Removes the entry and returns the remaining combat locks so the caller can
   * re-apply them to the reconnecting player. Null when not lingering.
   */
  retire(characterId: string, now: number): CarriedCombatLocks | null {
    const player = this.byCharacterId.get(characterId);
    if (!player) return null;
    this.byCharacterId.delete(characterId);
    return {
      combatLockMs: player.conditions.remainingMs("combat-lock", now),
      pzLockMs: player.conditions.remainingMs("pz-lock", now),
    };
  }

  /**
   * Characters whose linger window has closed: the combat lock expired, or
   * they died, or the world no longer holds them. Runs inside the tick.
   */
  due(
    now: number,
    isInWorld: (characterId: string) => boolean,
  ): ReadonlyArray<Player> {
    const expired: Player[] = [];
    for (const [characterId, player] of this.byCharacterId) {
      if (
        !isInWorld(characterId) ||
        player.health <= 0 ||
        player.conditions.remainingMs("combat-lock", now) <= 0
      ) {
        expired.push(player);
      }
    }
    for (const player of expired) this.byCharacterId.delete(player.id);
    return expired;
  }

  get size(): number {
    return this.byCharacterId.size;
  }
}
