import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations",
);

/**
 * The newest definition a migration gives a constraint. Migrations apply in
 * version order, so the last one wins.
 */
function currentCheck(constraint: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
  let definition: string | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    // Whitespace-tolerant: migrations wrap `check` onto its own line.
    const marker = new RegExp(`add constraint\\s+${constraint}\\s+check`, "g");
    for (let hit = marker.exec(sql); hit; hit = marker.exec(sql)) {
      const start = sql.indexOf("(", hit.index + hit[0].length);
      let depth = 0;
      let end = start;
      for (; end < sql.length; end += 1) {
        if (sql[end] === "(") depth += 1;
        else if (sql[end] === ")" && (depth -= 1) === 0) break;
      }
      definition = sql.slice(start, end + 1).replace(/\s+/g, " ");
    }
  }
  if (definition === null) throw new Error(`no migration defines ${constraint}`);
  return definition;
}

/**
 * A character's progression has no ceiling — Canary has none either (`uint32_t`
 * level, `uint64_t` experience, and no CHECK on any of them in schema.sql).
 * The column widths are the only limit, exactly as there.
 *
 * This exists because the opposite kept biting: an upper bound written against
 * whatever the level cap happened to be silently became a wall the game could
 * walk into. `characters_mana_upper_bound` capped mana at 100000 and a level
 * 5000 sorcerer (150025 max mana) could then not be saved at all — every
 * persist failed the constraint. An upper bound on any of these is the bug.
 */
describe("progression columns carry no upper bound", () => {
  for (const constraint of [
    "characters_level_check",
    "characters_experience_check",
    "characters_health_upper_bound",
    "characters_mana_upper_bound",
  ]) {
    it(`leaves ${constraint} open above`, () => {
      const definition = currentCheck(constraint);
      // A lower bound (`>= 0`) is fine and wanted; `<=`, `<`, or `between`
      // would re-introduce the ceiling.
      expect(definition).not.toMatch(/<=|<[^=]|between/i);
    });
  }
});
