/**
 * Durable per-character kill counters keyed by bestiary race id.
 * Bestiary and bosstiary share one counter namespace like Canary.
 */
export interface BestiaryStore {
  loadKills(characterId: string): Promise<ReadonlyMap<number, number>>;
  addKills(characterId: string, raceId: number, amount: number): Promise<void>;
}
