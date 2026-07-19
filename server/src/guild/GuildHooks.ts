/** Combat-facing guild surface (war kill accounting; PVP checks in 14c). */
export interface GuildHooks {
  /**
   * Called from the player-death path. Only records anything when both
   * characters belong to guilds with a mutual active war; the durable
   * insert plus the frag-limit end-war check run in one transaction.
   */
  recordWarKill(
    killerCharacterId: string,
    targetCharacterId: string,
    now: number,
  ): void;
}
