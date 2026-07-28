// Grants a character every outfit in the pinned catalog with both addons, plus
// every mount. Entitlements are the only gate the server honours, so this
// writes `character_outfits`/`character_mounts` rows and nothing else — the
// character still has to select an outfit through the normal, server-validated
// path.
//
// The catalog is read from server/src/outfit/outfitCatalog.ts so this tool can
// never grant a look type the server would refuse.
//
// Usage: yarn character:grant-outfits "Character Name" [--dry-run]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHARACTER_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const FULL_ADDONS = 3;

const CATALOG_PATH = fileURLToPath(
  new URL("../server/src/outfit/outfitCatalog.ts", import.meta.url),
);

function readCatalogIds(source, arrayName, idField) {
  const block = new RegExp(
    `const ${arrayName}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`,
  ).exec(source);
  if (!block) throw new Error(`${arrayName} not found in outfitCatalog.ts`);
  const ids = [...block[1].matchAll(new RegExp(`${idField}:\\s*(\\d+)`, "g"))]
    .map((match) => Number(match[1]));
  if (ids.length === 0) {
    throw new Error(`no ${idField} entries parsed from ${arrayName}`);
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}

function readCatalog() {
  const source = readFileSync(CATALOG_PATH, "utf8");
  return {
    lookTypes: readCatalogIds(source, "OUTFIT_DEFINITIONS", "lookType"),
    mountIds: readCatalogIds(source, "MOUNT_DEFINITIONS", "mountId"),
  };
}

function readArguments() {
  const [characterName, ...options] = process.argv.slice(2);
  const dryRun = options.length === 1 && options[0] === "--dry-run";
  if (!characterName || (options.length > 0 && !dryRun)) {
    throw new Error(
      'usage: yarn character:grant-outfits "Character Name" [--dry-run]',
    );
  }
  const normalizedName = characterName.trim().replace(/\s+/g, " ");
  if (
    normalizedName.length < 3 ||
    normalizedName.length > 20 ||
    !CHARACTER_NAME_PATTERN.test(normalizedName)
  ) {
    throw new Error("character name is invalid");
  }
  return { characterName: normalizedName, dryRun };
}

async function grantAllOutfits(characterName, catalog) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in the environment or root .env");
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  let transactionStarted = false;
  await client.connect();
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const selected = await client.query(
      `SELECT id, display_name
       FROM characters
       WHERE normalized_name = lower($1)
       FOR UPDATE`,
      [characterName],
    );
    const character = selected.rows[0];
    if (!character) throw new Error(`character not found: ${characterName}`);

    // Addons are OR-merged exactly as PgOutfitStore does, so re-running this
    // never takes an addon away and the row count reflects real changes only.
    const outfits = await client.query(
      `INSERT INTO character_outfits (character_id, look_type, addons)
       SELECT $1, look_type, $3
       FROM unnest($2::integer[]) AS look_type
       ON CONFLICT (character_id, look_type)
       DO UPDATE SET addons = character_outfits.addons | EXCLUDED.addons
       WHERE character_outfits.addons <> (character_outfits.addons | EXCLUDED.addons)
       RETURNING look_type`,
      [character.id, catalog.lookTypes, FULL_ADDONS],
    );
    const mounts = await client.query(
      `INSERT INTO character_mounts (character_id, mount_id)
       SELECT $1, mount_id
       FROM unnest($2::integer[]) AS mount_id
       ON CONFLICT DO NOTHING
       RETURNING mount_id`,
      [character.id, catalog.mountIds],
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return {
      displayName: character.display_name,
      outfitsChanged: outfits.rowCount,
      mountsGranted: mounts.rowCount,
    };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const { characterName, dryRun } = readArguments();
  const catalog = readCatalog();
  if (dryRun) {
    console.log(
      `Would grant "${characterName}" ${catalog.lookTypes.length} outfits ` +
        `with addons ${FULL_ADDONS} and ${catalog.mountIds.length} mounts.`,
    );
    return;
  }

  const result = await grantAllOutfits(characterName, catalog);
  console.log(
    `Granted "${result.displayName}" ${catalog.lookTypes.length} outfits ` +
      `(${result.outfitsChanged} rows added or upgraded to full addons) and ` +
      `${catalog.mountIds.length} mounts (${result.mountsGranted} newly granted).`,
  );
  console.log(
    "Entitlements are cached at login: the character must relog before the " +
      "outfit window lists them.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
