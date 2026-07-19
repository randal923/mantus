import {
  HIGHSCORE_LIMITS,
  type CharacterVocation,
  type HighscoreCategory,
} from "@tibia/protocol";
import type {
  HighscorePageRecord,
  HighscoreRowRecord,
  HighscoreStore,
} from "./HighscoreStore";

export interface MemoryHighscoreCharacter {
  readonly name: string;
  readonly level: number;
  readonly vocation: CharacterVocation;
  readonly experience: number;
  readonly magicLevel: number;
  readonly skills: Readonly<Partial<Record<HighscoreCategory, number>>>;
}

/**
 * In-memory HighscoreStore over a fixed character list, applying the same
 * page-size/depth bounds as the Pg store; also counts loads so tests can
 * assert the service cache prevents repeat queries.
 */
export class MemoryHighscoreStore implements HighscoreStore {
  loadCount = 0;

  constructor(
    private readonly characters: ReadonlyArray<MemoryHighscoreCharacter>,
  ) {}

  async loadPage(input: {
    category: HighscoreCategory;
    vocation: CharacterVocation | null;
    page: number;
  }): Promise<HighscorePageRecord> {
    this.loadCount += 1;
    const page = Math.min(
      Math.max(0, Math.trunc(input.page)),
      HIGHSCORE_LIMITS.maxPage,
    );
    const ranked: HighscoreRowRecord[] = this.characters
      .filter(
        (character) =>
          input.vocation === null || character.vocation === input.vocation,
      )
      .map((character) => ({
        name: character.name,
        level: character.level,
        vocation: character.vocation,
        value: this.valueOf(character, input.category),
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, HIGHSCORE_LIMITS.maxRankDepth);
    const start = page * HIGHSCORE_LIMITS.pageSize;
    return {
      totalEntries: ranked.length,
      rows: ranked.slice(start, start + HIGHSCORE_LIMITS.pageSize),
    };
  }

  private valueOf(
    character: MemoryHighscoreCharacter,
    category: HighscoreCategory,
  ): number {
    if (category === "experience") return character.experience;
    if (category === "magic") return character.magicLevel;
    return character.skills[category] ?? 10;
  }
}
