import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

// Session-level lock so concurrent `yarn db:migrate` runs serialize; released
// automatically when the connection closes.
const MIGRATION_LOCK_KEY = 7_281_001;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set; add it to the root .env");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../db/migrations");

interface Migration {
  version: number;
  file: string;
  sql: string;
  checksum: string;
}

const migrations: Migration[] = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => {
    const match = /^(\d+)_[\w-]+\.sql$/.exec(file);
    if (!match) {
      throw new Error(`migration filename must look like 001_name.sql: ${file}`);
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    return {
      version: Number(match[1]),
      file,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  })
  .sort((a, b) => a.version - b.version);

for (let i = 1; i < migrations.length; i++) {
  if (migrations[i].version === migrations[i - 1].version) {
    throw new Error(
      `duplicate migration version ${migrations[i].version}: ${migrations[i - 1].file} and ${migrations[i].file}`,
    );
  }
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
  await client.query(`
    create table if not exists schema_migrations (
      version integer primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await client.query<{ version: number; checksum: string }>(
    "select version, checksum from schema_migrations",
  );
  const applied = new Map(rows.map((row) => [row.version, row.checksum]));

  let pending = 0;
  for (const migration of migrations) {
    const appliedChecksum = applied.get(migration.version);
    if (appliedChecksum !== undefined) {
      if (appliedChecksum !== migration.checksum) {
        throw new Error(
          `${migration.file} changed after it was applied (checksum mismatch); ` +
            "write a new migration instead of editing an applied one",
        );
      }
      continue;
    }

    await client.query("begin");
    try {
      await client.query(migration.sql);
      await client.query(
        "insert into schema_migrations (version, checksum) values ($1, $2)",
        [migration.version, migration.checksum],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    console.log(`applied ${migration.file}`);
    pending++;
  }

  if (pending === 0) {
    console.log("database is up to date");
  }
} finally {
  await client.end();
}
