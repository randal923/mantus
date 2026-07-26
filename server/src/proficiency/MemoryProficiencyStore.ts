import type { ProficiencyRecord, ProficiencyStore } from "./ProficiencyStore";

export class MemoryProficiencyStore implements ProficiencyStore {
  private readonly records = new Map<string, Map<number, ProficiencyRecord>>();
  private readonly animus = new Map<string, Set<number>>();

  async load(characterId: string): Promise<ReadonlyArray<ProficiencyRecord>> {
    return [...(this.records.get(characterId)?.values() ?? [])];
  }

  async save(characterId: string, record: ProficiencyRecord): Promise<void> {
    const byId = this.records.get(characterId) ?? new Map();
    this.records.set(characterId, byId);
    byId.set(record.proficiencyId, record);
  }

  async loadAnimus(characterId: string): Promise<ReadonlyArray<number>> {
    return [...(this.animus.get(characterId) ?? [])];
  }

  async grantAnimus(characterId: string, raceId: number): Promise<void> {
    const set = this.animus.get(characterId) ?? new Set<number>();
    this.animus.set(characterId, set);
    set.add(raceId);
  }
}
