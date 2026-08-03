// Development stocking of a character's supply stash with imbuement materials.
//
// The shrine spends astral sources from carried rows first and the stash for
// the shortfall (server/src/imbuement/planImbuementMaterials.ts), so a stash
// holding every source is all a tester needs to try any imbuement. The list is
// read from content/imbuements.json — never hand-written — plus the blank
// imbuement scroll a scroll forge consumes, and every id is checked against
// server/data/item-catalog.json before a row is written.
//
// The grant is a top-up: it raises each entry to the requested count and never
// lowers one, so re-running is a no-op instead of a second helping.
//
// Usage: yarn imbuement:grant-materials "Character Name" [--count 500] [--dry-run]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHARACTER_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const DEFAULT_COUNT = 500;
const MAX_ITEM_TYPE_ID = 65_535;

/** Reads a pinned numeric constant so this tool cannot drift from the server. */
function readNumericConstant(relativePath, name) {
  const source = readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
  const match = new RegExp(`${name}:\\s*([\\d_]+)`).exec(source);
  if (!match) throw new Error(`${name} not found in ${relativePath}`);
  return Number(match[1].replaceAll("_", ""));
}

const BLANK_SCROLL_ITEM_TYPE_ID = readNumericConstant(
  "../protocol/src/imbuements.ts",
  "blankScrollItemTypeId",
);
// Also the supply_stash count check in migration 015.
const MAX_STASH_COUNT = readNumericConstant(
  "../protocol/src/depot.ts",
  "maxStashAmount",
);

function readMaterials() {
  const catalog = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../content/imbuements.json", import.meta.url)),
      "utf8",
    ),
  );
  if (catalog.formatVersion !== 1 || !Array.isArray(catalog.imbuements)) {
    throw new Error("imbuement catalog has an unsupported format");
  }
  const typeIds = new Set([BLANK_SCROLL_ITEM_TYPE_ID]);
  for (const imbuement of catalog.imbuements) {
    if (!Array.isArray(imbuement.astralSources)) {
      throw new Error(`imbuement ${imbuement.id} has no astral sources`);
    }
    for (const source of imbuement.astralSources) {
      typeIds.add(source.itemTypeId);
    }
  }

  const items = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../server/data/item-catalog.json", import.meta.url)),
      "utf8",
    ),
  ).items;
  // `stowable` lives beside the catalog and is merged in by loadItemCatalog.
  const stowable = new Set(
    JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("../server/data/stowable-item-types.json", import.meta.url),
        ),
        "utf8",
      ),
    ).itemTypeIds,
  );
  return [...typeIds]
    .sort((left, right) => left - right)
    .map((itemTypeId) => {
      if (
        !Number.isInteger(itemTypeId) ||
        itemTypeId < 1 ||
        itemTypeId > MAX_ITEM_TYPE_ID
      ) {
        throw new Error(`material ${itemTypeId} is not a usable item type id`);
      }
      const item = items[String(itemTypeId)];
      if (!item) {
        throw new Error(`material ${itemTypeId} is not in the item catalog`);
      }
      // The same shape planStashDeposit demands of anything entering the stash.
      if (
        !stowable.has(itemTypeId) ||
        !item.stackable ||
        !item.pickupable ||
        !item.movable ||
        item.containerCapacity !== undefined
      ) {
        throw new Error(
          `material ${itemTypeId} (${item.name}) cannot live in the supply stash`,
        );
      }
      return { itemTypeId, name: item.name };
    });
}

function readArguments() {
  const [characterName, ...options] = process.argv.slice(2);
  const usage =
    'usage: yarn imbuement:grant-materials "Character Name" ' +
    "[--count <amount>] [--dry-run]";
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
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_STASH_COUNT) {
      throw new Error(`--count must be an integer from 1 to ${MAX_STASH_COUNT}`);
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

const stashTopUpQuery = `WITH target AS (
       SELECT unnest($2::integer[]) AS item_type_id
     ), before AS (
       SELECT item_type_id, count
       FROM supply_stash
       WHERE character_id = $1
     ), upserted AS (
       INSERT INTO supply_stash (character_id, item_type_id, count)
       SELECT $1, item_type_id, $3::bigint FROM target
       ON CONFLICT (character_id, item_type_id) DO UPDATE
         SET count = GREATEST(supply_stash.count, EXCLUDED.count),
             updated_at = now()
       RETURNING item_type_id, count
     )
     SELECT upserted.item_type_id,
            upserted.count AS count_after,
            COALESCE(before.count, 0) AS count_before
     FROM upserted
     LEFT JOIN before USING (item_type_id)
     ORDER BY upserted.item_type_id`;

const auditQuery = `INSERT INTO audit_log(event_type, character_id, details)
     SELECT 'item-created', $1, jsonb_build_object(
       'operation', 'stash-grant',
       'itemTypeId', granted.item_type_id,
       'count', granted.added,
       'stashCountAfter', granted.count_after,
       'source', 'tools/grantImbuementMaterials.mjs'
     )
     FROM unnest($2::integer[], $3::bigint[], $4::bigint[])
       AS granted(item_type_id, added, count_after)`;

async function grantMaterials({ characterName, count, materials }) {
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
      `SELECT id, display_name
       FROM characters
       WHERE normalized_name = lower($1)
       FOR UPDATE`,
      [characterName],
    );
    const character = selected.rows[0];
    if (!character) throw new Error(`character not found: ${characterName}`);

    const stashed = await client.query(stashTopUpQuery, [
      character.id,
      materials.map((material) => material.itemTypeId),
      count,
    ]);
    const raised = stashed.rows
      .map((row) => ({
        itemTypeId: row.item_type_id,
        added: Number(row.count_after) - Number(row.count_before),
        countAfter: Number(row.count_after),
      }))
      .filter((row) => row.added > 0);

    let stashRevision = null;
    if (raised.length > 0) {
      await client.query(
        `INSERT INTO character_storage_state (character_id) VALUES ($1)
         ON CONFLICT (character_id) DO NOTHING`,
        [character.id],
      );
      const bumped = await client.query(
        `UPDATE character_storage_state
         SET stash_revision = stash_revision + 1, updated_at = now()
         WHERE character_id = $1
         RETURNING stash_revision`,
        [character.id],
      );
      stashRevision = bumped.rows[0].stash_revision;
      await client.query(auditQuery, [
        character.id,
        raised.map((row) => row.itemTypeId),
        raised.map((row) => row.added),
        raised.map((row) => row.countAfter),
      ]);
    }

    await client.query("COMMIT");
    transactionStarted = false;
    return { displayName: character.display_name, raised, stashRevision };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const { characterName, count, dryRun } = readArguments();
  const materials = readMaterials();
  if (dryRun) {
    console.log(
      `Would top "${characterName}" up to ${count} of each of ` +
        `${materials.length} imbuement materials.`,
    );
    return;
  }

  console.warn(
    "The stash is written directly; log the character out first — an online " +
      "character keeps its stash in memory and will overwrite these rows.",
  );
  const result = await grantMaterials({ characterName, count, materials });
  console.log(
    `Topped "${result.displayName}" up to ${count} of each of ` +
      `${materials.length} imbuement materials.`,
  );
  console.log(
    `Raised ${result.raised.length} stash entries; ` +
      `${materials.length - result.raised.length} were already at ${count} ` +
      `or more.` +
      (result.stashRevision === null
        ? ""
        : ` Stash revision is now ${result.stashRevision}.`),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
