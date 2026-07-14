import { Pool } from "pg";
import { serverConfig } from "./config";
import { GameServer } from "./GameServer";
import { PgAccountStore } from "./PgAccountStore";
import { SupabaseTokenVerifier } from "./SupabaseTokenVerifier";

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

const server = new GameServer(serverConfig, { verifier, accounts });
server.start();

const shutdown = () => {
  server.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
