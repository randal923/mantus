import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";

const migrationsDirectory = fileURLToPath(
  new URL("../../db/migrations/", import.meta.url),
);

/**
 * Replays every migration in `server/db/migrations/`, in the same
 * version-number order `scripts/migrate.ts` uses, against `client`'s current
 * search_path. Integration tests used to replay hand-maintained file lists,
 * which drifted silently the moment a new migration landed: the schema under
 * test stopped matching production. Reading the directory means a new
 * migration is exercised by every integration test the day it is added.
 */
export async function applyMigrations(client: Client): Promise<void> {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .map((file) => {
      const match = /^(\d+)_[\w-]+\.sql$/.exec(file);
      if (!match) {
        throw new Error(`migration filename must look like 001_name.sql: ${file}`);
      }
      return { file, version: Number(match[1]) };
    })
    .sort((a, b) => a.version - b.version);
  for (const { file } of files) {
    await client.query(await readFile(`${migrationsDirectory}${file}`, "utf8"));
  }
}
