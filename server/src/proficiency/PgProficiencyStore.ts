import type { Pool } from "pg";
import type { ProficiencySelection } from "@tibia/protocol";
import { insertAnimusQuery } from "./sql/insertAnimusQuery";
import { selectAnimusQuery } from "./sql/selectAnimusQuery";
import { selectProficienciesQuery } from "./sql/selectProficienciesQuery";
import { upsertProficiencyQuery } from "./sql/upsertProficiencyQuery";
import type { ProficiencyRecord, ProficiencyStore } from "./ProficiencyStore";

interface ProficiencyRow {
  proficiency_id: number;
  experience: string;
  mastered: boolean;
  selections: unknown;
}

export class PgProficiencyStore implements ProficiencyStore {
  constructor(private readonly pool: Pool) {}

  async load(characterId: string): Promise<ReadonlyArray<ProficiencyRecord>> {
    const result = await this.pool.query<ProficiencyRow>(
      selectProficienciesQuery,
      [characterId],
    );
    return result.rows.map((row) => ({
      proficiencyId: row.proficiency_id,
      experience: Number(row.experience),
      mastered: row.mastered,
      selections: parseSelections(row.selections),
    }));
  }

  async save(characterId: string, record: ProficiencyRecord): Promise<void> {
    await this.pool.query(upsertProficiencyQuery, [
      characterId,
      record.proficiencyId,
      record.experience,
      record.mastered,
      JSON.stringify(record.selections),
    ]);
  }

  async loadAnimus(characterId: string): Promise<ReadonlyArray<number>> {
    const result = await this.pool.query<{ race_id: number }>(
      selectAnimusQuery,
      [characterId],
    );
    return result.rows.map((row) => row.race_id);
  }

  async grantAnimus(characterId: string, raceId: number): Promise<void> {
    await this.pool.query(insertAnimusQuery, [characterId, raceId]);
  }
}

function parseSelections(value: unknown): ProficiencySelection[] {
  if (!Array.isArray(value)) return [];
  const selections: ProficiencySelection[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { level, index } = entry as Record<string, unknown>;
    if (typeof level !== "number" || typeof index !== "number") continue;
    selections.push({ level, index });
  }
  return selections;
}
