import type { BestiaryStore } from "./BestiaryStore";

export class MemoryBestiaryStore implements BestiaryStore {
  private readonly killsByCharacter = new Map<string, Map<number, number>>();

  async loadKills(characterId: string): Promise<ReadonlyMap<number, number>> {
    return new Map(this.killsByCharacter.get(characterId) ?? []);
  }

  async addKills(
    characterId: string,
    raceId: number,
    amount: number,
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("bestiary kill amount must be a positive integer");
    }
    const kills =
      this.killsByCharacter.get(characterId) ?? new Map<number, number>();
    kills.set(raceId, (kills.get(raceId) ?? 0) + amount);
    this.killsByCharacter.set(characterId, kills);
  }
}
