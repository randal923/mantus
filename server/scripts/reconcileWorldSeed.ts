import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { collectWorldSeedKeys } from "../src/item/collectWorldSeedKeys";
import { reconcileWorldSeed } from "../src/item/reconcileWorldSeed";

// Offline reconciliation of persisted world-item delta rows after a map
// re-import (charter rule 12). Run with the game server DOWN — it mutates the
// items table outside the tick. Deletes only stale rows whose seed fixture
// still exists in the new items.bin and are still world/house-located in place,
// writing an item-destroyed audit row for each; aborts the whole transaction if
// any stale row is unclassifiable (manual review required).

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set; add it to server/.env");
  process.exit(1);
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data");
const mapName = process.env.MAP_NAME ?? "otservbr";

const meta = JSON.parse(
  readFileSync(join(dataDir, `${mapName}.map.json`), "utf8"),
) as { name?: string; source?: { mapSha256?: string; itemsSha256?: string } };
const mapSha256 = meta.source?.mapSha256;
const itemsSha256 = meta.source?.itemsSha256;
if (
  meta.name !== mapName ||
  typeof mapSha256 !== "string" ||
  typeof itemsSha256 !== "string"
) {
  console.error(`${mapName}.map.json is missing its source hashes`);
  process.exit(1);
}
const mapVersion = createHash("sha256")
  .update(`${mapSha256}:${itemsSha256}`)
  .digest("hex");

const validSeedKeys = collectWorldSeedKeys(
  readFileSync(join(dataDir, `${mapName}.items.bin`)),
  readFileSync(join(dataDir, `${mapName}.content.json`)),
  mapName,
);

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const result = await reconcileWorldSeed(client, {
      mapName,
      mapVersion,
      validSeedKeys,
    });
    await client.query("COMMIT");
    if (result.staleRows === 0) {
      console.log(`no stale world-seed rows for ${mapName}@${mapVersion}`);
    } else {
      console.log(
        `reconciled ${result.deleted} stale world-seed row(s) for ` +
          `${mapName}@${mapVersion}; audit rows written`,
      );
    }
  } catch (cause) {
    await client.query("ROLLBACK");
    throw cause;
  }
} finally {
  await client.end();
}
