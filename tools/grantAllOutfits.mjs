// Grants a character every outfit their sex can wear — with all the addons the
// sprite pack actually has — plus every mount in the catalog. Entitlements are
// the only gate the server honours, so this writes `character_outfits` /
// `character_mounts` rows and nothing else: the character still has to select
// an outfit through the normal, server-validated path.
//
// The catalog is read from server/src/outfit/outfitCatalogData.ts so this tool
// can never grant a look type the server would refuse.
//
// Usage: yarn character:grant-outfits "Character Name" [--dry-run]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHARACTER_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
/** Canary PlayerSex_t, as stored in characters.sex. */
const SEX_BY_CODE = { 0: "female", 1: "male" };

const CATALOG_PATH = fileURLToPath(
  new URL("../server/src/outfit/outfitCatalogData.ts", import.meta.url),
);

function readCatalog() {
  const source = readFileSync(CATALOG_PATH, "utf8");
  const outfits = [
    ...source.matchAll(
      /\{ lookType: (\d+), name: "[^"]*", sex: "(male|female)", starter: \w+, premium: \w+, addons: (\d+) \}/g,
    ),
  ].map((match) => ({
    lookType: Number(match[1]),
    sex: match[2],
    // An addon bit for a pass the sprite pack lacks would be unwearable.
    addons: (1 << Number(match[3])) - 1,
  }));
  const mountIds = [
    ...source.matchAll(/\{ mountId: (\d+), name: "[^"]*", lookType: \d+,/g),
  ].map((match) => Number(match[1]));
  if (outfits.length === 0 || mountIds.length === 0) {
    throw new Error("no outfits or mounts parsed from outfitCatalogData.ts");
  }
  return { outfits, mountIds };
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
      `SELECT id, display_name, sex
       FROM characters
       WHERE normalized_name = lower($1)
       FOR UPDATE`,
      [characterName],
    );
    const character = selected.rows[0];
    if (!character) throw new Error(`character not found: ${characterName}`);
    const sex = SEX_BY_CODE[character.sex];
    if (!sex) throw new Error(`character has an unknown sex: ${character.sex}`);
    const wearable = catalog.outfits.filter((outfit) => outfit.sex === sex);

    // Addons are OR-merged exactly as PgOutfitStore does, so re-running this
    // never takes an addon away and the row count reflects real changes only.
    const outfits = await client.query(
      `INSERT INTO character_outfits (character_id, look_type, addons)
       SELECT $1, look_type, addons
       FROM unnest($2::integer[], $3::integer[]) AS granted(look_type, addons)
       ON CONFLICT (character_id, look_type)
       DO UPDATE SET addons = character_outfits.addons | EXCLUDED.addons
       WHERE character_outfits.addons <> (character_outfits.addons | EXCLUDED.addons)
       RETURNING look_type`,
      [
        character.id,
        wearable.map((outfit) => outfit.lookType),
        wearable.map((outfit) => outfit.addons),
      ],
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
      sex,
      wearable: wearable.length,
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
    const male = catalog.outfits.filter((outfit) => outfit.sex === "male");
    const female = catalog.outfits.filter((outfit) => outfit.sex === "female");
    console.log(
      `Would grant "${characterName}" every outfit of their sex ` +
        `(${male.length} male, ${female.length} female) with all addons, ` +
        `plus ${catalog.mountIds.length} mounts.`,
    );
    return;
  }

  const result = await grantAllOutfits(characterName, catalog);
  console.log(
    `Granted "${result.displayName}" (${result.sex}) ${result.wearable} ` +
      `outfits (${result.outfitsChanged} rows added or upgraded) and ` +
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
