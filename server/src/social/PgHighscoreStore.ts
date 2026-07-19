import type { Pool } from "pg";
import {
  HIGHSCORE_LIMITS,
  type CharacterVocation,
  type HighscoreCategory,
} from "@tibia/protocol";
import { countHighscoreCharactersQuery } from "./sql/countHighscoreCharactersQuery";
import { countHighscoreSkillQuery } from "./sql/countHighscoreSkillQuery";
import { highscoreByExperienceQuery } from "./sql/highscoreByExperienceQuery";
import { highscoreByMagicQuery } from "./sql/highscoreByMagicQuery";
import { highscoreBySkillQuery } from "./sql/highscoreBySkillQuery";
import type { HighscorePageRecord, HighscoreStore } from "./HighscoreStore";

interface HighscoreRow {
  display_name: string;
  level: number;
  vocation: CharacterVocation;
  value: string | number;
}

/** Skill-table categories; the value is a fixed parameter, never spliced. */
const SKILL_CATEGORIES: ReadonlySet<HighscoreCategory> = new Set([
  "fist",
  "club",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
]);

/**
 * Postgres highscore read model. Every category maps to one of three
 * fixed parameterized queries; page size, page depth, and the total-row
 * count are all hard-bounded server-side, so no request can walk the
 * character table (charter rules 1, 7 and the bounded-read-model rule).
 */
export class PgHighscoreStore implements HighscoreStore {
  constructor(private readonly pool: Pool) {}

  async loadPage(input: {
    category: HighscoreCategory;
    vocation: CharacterVocation | null;
    page: number;
  }): Promise<HighscorePageRecord> {
    const page = Math.min(
      Math.max(0, Math.trunc(input.page)),
      HIGHSCORE_LIMITS.maxPage,
    );
    const offset = page * HIGHSCORE_LIMITS.pageSize;
    if (SKILL_CATEGORIES.has(input.category)) {
      const [rows, count] = await Promise.all([
        this.pool.query<HighscoreRow>(highscoreBySkillQuery, [
          input.category,
          input.vocation,
          HIGHSCORE_LIMITS.pageSize,
          offset,
        ]),
        this.pool.query<{ total: number }>(countHighscoreSkillQuery, [
          input.category,
          input.vocation,
          HIGHSCORE_LIMITS.maxRankDepth,
        ]),
      ]);
      return this.toPage(rows.rows, count.rows[0]?.total ?? 0);
    }
    const query =
      input.category === "magic"
        ? highscoreByMagicQuery
        : highscoreByExperienceQuery;
    const [rows, count] = await Promise.all([
      this.pool.query<HighscoreRow>(query, [
        input.vocation,
        HIGHSCORE_LIMITS.pageSize,
        offset,
      ]),
      this.pool.query<{ total: number }>(countHighscoreCharactersQuery, [
        input.vocation,
        HIGHSCORE_LIMITS.maxRankDepth,
      ]),
    ]);
    return this.toPage(rows.rows, count.rows[0]?.total ?? 0);
  }

  private toPage(
    rows: ReadonlyArray<HighscoreRow>,
    total: number,
  ): HighscorePageRecord {
    return {
      totalEntries: Math.min(total, HIGHSCORE_LIMITS.maxRankDepth),
      rows: rows.map((row) => ({
        name: row.display_name,
        level: row.level,
        vocation: row.vocation,
        value: Number(row.value),
      })),
    };
  }
}
