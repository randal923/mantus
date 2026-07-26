import type { ProficiencySelection } from "@tibia/protocol";

export interface ProficiencyRecord {
  readonly proficiencyId: number;
  readonly experience: number;
  readonly mastered: boolean;
  readonly selections: ReadonlyArray<ProficiencySelection>;
}

/**
 * Durable weapon-proficiency progress and the animus mastery set. Both are
 * write-behind: experience only ever grows from server combat events, and a
 * lost trailing write can only under-count, never mint progress.
 */
export interface ProficiencyStore {
  load(characterId: string): Promise<ReadonlyArray<ProficiencyRecord>>;
  save(characterId: string, record: ProficiencyRecord): Promise<void>;
  loadAnimus(characterId: string): Promise<ReadonlyArray<number>>;
  grantAnimus(characterId: string, raceId: number): Promise<void>;
}
