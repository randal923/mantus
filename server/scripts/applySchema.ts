import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set; add it to the root .env");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "../db/schema.sql"), "utf8");
const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(schema);
  console.log("schema applied");
} finally {
  await client.end();
}
