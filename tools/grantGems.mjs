// Development stocking of a character's unrevealed gem balances.
//
// Gems are per-character balances in character_gem_resources (migration 028),
// not inventory items, and they are vocation-bound by construction: the
// balances live on the character, the atelier names them after the owner's
// vocation (GEM_VOCATION_NAMES) and rolls the vocation's supreme-mod pool at
// reveal time. Both mappings are read from the protocol source so this tool
// cannot drift from the server. No audit row is written — this mirrors the
// kill-drop credit path (GemStore.creditGemDrops), which is loot-like and
// unaudited; only reveal/destroy/switch/improve audit.
//
// The grant is a top-up: it raises each quality's balance to the requested
// count and never lowers one, so re-running is a no-op instead of a second
// helping.
//
// Usage: yarn gems:grant "Character Name" [--count 1000] [--dry-run]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHARACTER_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const DEFAULT_COUNT = 1000;
// Dev-tool bound, comfortably under the integer columns' range.
const MAX_COUNT = 1_000_000;
const GEM_QUALITIES = ["lesser", "regular", "greater"];

/** Reads a pinned string-record constant so this tool cannot drift from the server. */
function readStringRecord(relativePath, name) {
  const source = readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
  const start = source.indexOf(`export const ${name}`);
  const open = start === -1 ? -1 : source.indexOf("= {", start);
  const close = open === -1 ? -1 : source.indexOf("};", open);
  if (close === -1) throw new Error(`${name} not found in ${relativePath}`);
  const record = {};
  for (const entry of source
    .slice(open + 3, close)
    .matchAll(/(?:"([^"]+)"|([A-Za-z]+)):\s*"([^"]+)"/g)) {
    record[entry[1] ?? entry[2]] = entry[3];
  }
  if (Object.keys(record).length === 0) {
    throw new Error(`${name} in ${relativePath} has no string entries`);
  }
  return record;
}

// Full vocation -> wheel base vocation -> gem family display name.
const BASE_VOCATIONS = readStringRecord(
  "../protocol/src/wheel.ts",
  "WHEEL_BASE_VOCATION",
);
const GEM_FAMILY_NAMES = readStringRecord(
  "../protocol/src/gemAtelier.ts",
  "GEM_VOCATION_NAMES",
);

function readArguments() {
  const [characterName, ...options] = process.argv.slice(2);
  const usage =
    'usage: yarn gems:grant "Character Name" [--count <amount>] [--dry-run]';
  if (!characterName) throw new Error(usage);

  let count = DEFAULT_COUNT;
  let dryRun = false;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === "--dry-run") {
      dryRun = true;
      continue;
    }
    const value = options[index + 1];
    if (option !== "--count" || value === undefined) throw new Error(usage);
    index += 1;
    count = Number(value);
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT) {
      throw new Error(`--count must be an integer from 1 to ${MAX_COUNT}`);
    }
  }

  const normalizedName = characterName.trim().replace(/\s+/g, " ");
  if (
    normalizedName.length < 3 ||
    normalizedName.length > 20 ||
    !CHARACTER_NAME_PATTERN.test(normalizedName)
  ) {
    throw new Error("character name is invalid");
  }
  return { characterName: normalizedName, count, dryRun };
}

const gemTopUpQuery = `INSERT INTO character_gem_resources (
       character_id, lesser_gems, regular_gems, greater_gems
     ) VALUES ($1, $2, $2, $2)
     ON CONFLICT (character_id) DO UPDATE SET
       lesser_gems = GREATEST(character_gem_resources.lesser_gems, EXCLUDED.lesser_gems),
       regular_gems = GREATEST(character_gem_resources.regular_gems, EXCLUDED.regular_gems),
       greater_gems = GREATEST(character_gem_resources.greater_gems, EXCLUDED.greater_gems),
       updated_at = now()
     RETURNING lesser_gems, regular_gems, greater_gems`;

async function grantGems({ characterName, count }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in the environment or root .env");
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  let transactionStarted = false;
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    transactionStarted = true;
    const selected = await client.query(
      `SELECT id, display_name, vocation
       FROM characters
       WHERE normalized_name = lower($1)
       FOR UPDATE`,
      [characterName],
    );
    const character = selected.rows[0];
    if (!character) throw new Error(`character not found: ${characterName}`);

    const baseVocation = BASE_VOCATIONS[character.vocation];
    const gemFamily = baseVocation && GEM_FAMILY_NAMES[baseVocation];
    if (!gemFamily) {
      throw new Error(
        `${character.display_name} is a ${character.vocation}, which has ` +
          "no wheel gem family",
      );
    }

    const before = await client.query(
      `SELECT lesser_gems, regular_gems, greater_gems
       FROM character_gem_resources
       WHERE character_id = $1`,
      [character.id],
    );
    const previous = before.rows[0] ?? {
      lesser_gems: 0,
      regular_gems: 0,
      greater_gems: 0,
    };
    const topped = await client.query(gemTopUpQuery, [character.id, count]);

    await client.query("COMMIT");
    transactionStarted = false;
    return {
      displayName: character.display_name,
      vocation: character.vocation,
      gemFamily,
      balances: GEM_QUALITIES.map((quality) => ({
        quality,
        before: Number(previous[`${quality}_gems`]),
        after: Number(topped.rows[0][`${quality}_gems`]),
      })),
    };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const { characterName, count, dryRun } = readArguments();
  if (dryRun) {
    console.log(
      `Would top "${characterName}" up to ${count} of each unrevealed gem ` +
        `quality (${GEM_QUALITIES.join("/")}).`,
    );
    return;
  }

  console.warn(
    "Balances land in the database directly; an online character will not " +
      "see them until it relogs.",
  );
  const result = await grantGems({ characterName, count });
  console.log(
    `Topped "${result.displayName}" (${result.vocation}) up to ${count} ` +
      `${result.gemFamily}s of each quality.`,
  );
  for (const { quality, before, after } of result.balances) {
    const note = after > before ? "" : " (already there)";
    console.log(`  ${quality}: ${before} -> ${after}${note}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
