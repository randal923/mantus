import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { serverConfig } from "./config";
import { GameServer } from "./GameServer";
import { PgCharacterStore } from "./character/PgCharacterStore";
import { PgAccountStore } from "./PgAccountStore";
import { SupabaseTokenVerifier } from "./SupabaseTokenVerifier";
import { loadItemCatalog } from "./item/loadItemCatalog";
import { PgItemStore } from "./item/PgItemStore";
import { PgNpcTravelStore } from "./npc/PgNpcTravelStore";
import { WorldItemSeeder } from "./item/WorldItemSeeder";

const supabaseUrl = process.env.SUPABASE_URL;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !databaseUrl) {
  console.error(
    "Missing required env: set SUPABASE_URL and DATABASE_URL in the root .env " +
      "(see .env.example). SUPABASE_JWT_SECRET is only needed for legacy " +
      "HS256 projects.",
  );
  process.exit(1);
}

const verifier = new SupabaseTokenVerifier({
  supabaseUrl,
  jwtSecret: process.env.SUPABASE_JWT_SECRET,
});
const pool = new Pool({ connectionString: databaseUrl });
// idle pooled connections dropped by the pooler must not crash the process
pool.on("error", (cause) => {
  console.error(`postgres pool error: ${cause.message}`);
});
const accounts = new PgAccountStore(pool);
const characters = new PgCharacterStore(pool);
const itemCatalog = await loadItemCatalog();
const items = new PgItemStore(pool, itemCatalog, serverConfig.map.name);
const npcTravel = new PgNpcTravelStore(pool);
const worldItemDeltas =
  serverConfig.map.source === "data"
    ? await new WorldItemSeeder(
        items,
        fileURLToPath(new URL("../data", import.meta.url)),
        serverConfig.map.name,
      ).prepare()
    : undefined;

const server = new GameServer(serverConfig, {
  verifier,
  accounts,
  characters,
  items,
  itemCatalog,
  npcTravel,
  worldItemDeltas,
});
server.start();

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.stop();
  await pool.end();
  process.exitCode = server.unsavedPlayerCount > 0 ? 1 : 0;
};
const requestShutdown = () => {
  void shutdown().catch((cause: unknown) => {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.error(`game server shutdown failed: ${reason}`);
    process.exitCode = 1;
  });
};
process.on("SIGINT", requestShutdown);
process.on("SIGTERM", requestShutdown);
