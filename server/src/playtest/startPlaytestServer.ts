import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { parse, stringify } from "yaml";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const DEFAULT_PORT = 4123;
/** Local docker Postgres (docker-compose.yml); never the production database. */
const DEFAULT_ADMIN_URL =
  "postgres://tibia:tibia_dev_only@localhost:5432/postgres";
const DEFAULT_DATABASE = "playtest";

export interface PlaytestServer {
  url: string;
  stop(): Promise<void>;
}

/**
 * Boots the real game server as a child process for a playtest scenario:
 * creates the local playtest database if missing, applies migrations, then
 * starts src/index.ts with DEV_AUTH=1 and DEV_COMMANDS=1 against it. The
 * Supabase .env values are deliberately not loaded — playtests must never
 * touch the remote database.
 */
export async function startPlaytestServer(
  options: { port?: number; log?: boolean } = {},
): Promise<PlaytestServer> {
  const log = process.env.PLAYTEST_LOG === "1" || (options.log ?? false);
  const port = options.port ?? Number(process.env.PLAYTEST_PORT ?? DEFAULT_PORT);
  const database = process.env.PLAYTEST_DATABASE ?? DEFAULT_DATABASE;
  const adminUrl = process.env.PLAYTEST_ADMIN_URL ?? DEFAULT_ADMIN_URL;
  await ensureDatabase(adminUrl, database);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${database}`;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl.toString(),
    SUPABASE_URL: "",
    SUPABASE_JWT_SECRET: "",
    DEV_AUTH: "1",
    DEV_COMMANDS: "1",
    SERVER_PORT: String(port),
    // Playtests assert Canary-parity numbers, so the boosted dev rates are
    // pinned back to 1x for the child server.
    CONFIG_PATH: writeParityConfig(),
  };

  await runToCompletion("db:migrate", ["scripts/migrate.ts"], env);

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts"],
    { cwd: serverRoot, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  // A scenario dying on an uncaught exception skips its finally/stop; make
  // sure the child game server never outlives the scenario process.
  const killChild = () => child.kill("SIGKILL");
  process.once("exit", killChild);
  const ready = waitForListening(child, log);
  let stopping = false;
  const exited = once(child, "exit").then(([code]) => {
    // The same promise settles again when stop() kills the child; throwing
    // then would be an unhandled rejection racing the scenario's exit code.
    if (stopping) return;
    throw new Error(`game server exited early with code ${String(code)}`);
  });
  await Promise.race([ready, exited]);

  return {
    url: `ws://127.0.0.1:${port}`,
    stop: async () => {
      stopping = true;
      process.removeListener("exit", killChild);
      child.kill("SIGINT");
      const finished = once(child, "exit");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
      await finished;
      clearTimeout(timeout);
    },
  };
}

function writeParityConfig(): string {
  const config = parse(
    readFileSync(join(serverRoot, "../config.yml"), "utf8"),
  ) as { rates?: Record<string, number> };
  config.rates = {
    ...config.rates,
    experience: 1,
    skill: 1,
    magic: 1,
    loot: 1,
  };
  const directory = mkdtempSync(join(tmpdir(), "tibia-playtest-"));
  const path = join(directory, "config.yml");
  writeFileSync(path, stringify(config));
  return path;
}

async function ensureDatabase(adminUrl: string, database: string): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) {
    throw new Error("playtest database name must be a plain identifier");
  }
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database],
    );
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${database}`);
    }
  } finally {
    await client.end();
  }
}

function runToCompletion(
  label: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", ...args],
      { cwd: serverRoot, env, stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${String(code)}`));
    });
    child.on("error", reject);
  });
}

function waitForListening(child: ChildProcess, log: boolean): Promise<void> {
  return new Promise((resolve) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (log) process.stdout.write(`[server] ${text}`);
      if (text.includes("game server listening")) resolve();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (log) process.stderr.write(`[server] ${chunk.toString()}`);
    });
  });
}
