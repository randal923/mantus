/**
 * Live social-state lookups consulted at combat execution time. Every call
 * must reflect the current tick's state (party registry and guild caches),
 * so leaving a party or guild takes effect on the very next attack.
 */
export interface PvpRelations {
  sameParty(characterIdA: string, characterIdB: string): boolean;
  sameGuild(characterIdA: string, characterIdB: string): boolean;
  atWar(characterIdA: string, characterIdB: string): boolean;
}
