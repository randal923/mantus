import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { PgPvpStore } from "./PgPvpStore";

const TEST_SCHEMA = "pvp_store_integration";
const MIGRATION_LOCK_KEY = 7_281_018;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgPvpStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`pvp-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Fragger ${label}`,
    vocation: "Knight",
    lookType: 128,
  });
  const summaries = await characterStore.listByAccountId(accountId);
  const summary = summaries[summaries.length - 1];
  if (!summary) throw new Error("character was not created");
  return summary.id;
};

const killRowCount = async (): Promise<number> => {
  const result = await pool.query<{ total: string }>(
    "SELECT count(*) AS total FROM character_kills",
  );
  return Number(result.rows[0]?.total ?? 0);
};

const sanctionAuditRows = async () => {
  const result = await pool.query<{
    character_id: string;
    details: { skull: string; deathEventId: string };
  }>(
    `SELECT character_id, details FROM audit_log
     WHERE event_type = 'pvp-skull-sanction'
     ORDER BY id`,
  );
  return result.rows;
};

databaseDescribe("PgPvpStore integration", () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    setupClient = new Client({ connectionString: databaseUrl });
    await setupClient.connect();
    await setupClient.query("SELECT pg_advisory_lock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    await setupClient.query(`SET search_path TO ${TEST_SCHEMA}`);
    const migrationsDirectory = fileURLToPath(
      new URL("../../db/migrations/", import.meta.url),
    );
    for (const migration of [
      "001_accounts.sql",
      "002_account_language.sql",
      "003_characters.sql",
      "004_audit_log.sql",
      "005_items.sql",
      "006_item_identity_error.sql",
      "007_progression.sql",
      "008_diagonal_direction.sql",
      "009_item_interactions.sql",
      "010_monk_vocations.sql",
      "011_npc_travel.sql",
      "012_bank.sql",
      "013_shops.sql",
      "014_character_storages.sql",
      "015_depot_and_inbox.sql",
      "016_market.sql",
      "017_guilds.sql",
      "018_pvp.sql",
      "019_houses.sql",
      "020_social.sql",
      "021_moderation.sql",
      "023_character_action_bar.sql",
      "029_character_potion_action_bar.sql",
      "034_unified_action_bar.sql",
    ]) {
      await setupClient.query(
        await readFile(`${migrationsDirectory}${migration}`, "utf8"),
      );
    }
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
    characterStore = new PgCharacterStore(pool);
    characterService = new CharacterService(characterStore, {
      x: 100,
      y: 200,
      z: 7,
      townId: 1,
    });
    store = new PgPvpStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM character_kills");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool?.end();
    await setupClient?.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient?.end();
  });

  it("records a replayed death event exactly once: one frag row, one audit row", async () => {
    const [killer, victim] = await Promise.all([
      createCharacter("killer"),
      createCharacter("victim"),
    ]);
    const input = {
      deathEventId: "death:replayed",
      killerCharacterId: killer,
      victimCharacterId: victim,
      occurredAt: new Date(),
      unjustified: true,
      avengeCutoff: null,
      sanction: {
        skull: "red" as const,
        expiresAt: new Date(Date.now() + 24 * 3_600_000),
      },
    };

    // A racing replay of the same death event must not double anything.
    const results = await Promise.all([
      store.recordKill(input),
      store.recordKill(input),
    ]);
    expect(results.filter((result) => result === "recorded")).toHaveLength(1);
    expect(results.filter((result) => result === "duplicate")).toHaveLength(1);
    expect(await killRowCount()).toBe(1);
    const audits = await sanctionAuditRows();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.character_id).toBe(killer);
    expect(audits[0]?.details.skull).toBe("red");
    expect(audits[0]?.details.deathEventId).toBe("death:replayed");
  });

  it("marks exactly one reverse kill avenged on a justified-avenge", async () => {
    const [killer, avenger] = await Promise.all([
      createCharacter("killer"),
      createCharacter("avenger"),
    ]);
    const base = Date.now();
    await store.recordKill({
      deathEventId: "death:first",
      killerCharacterId: killer,
      victimCharacterId: avenger,
      occurredAt: new Date(base - 2_000),
      unjustified: true,
      avengeCutoff: null,
      sanction: null,
    });
    await store.recordKill({
      deathEventId: "death:second",
      killerCharacterId: killer,
      victimCharacterId: avenger,
      occurredAt: new Date(base - 1_000),
      unjustified: true,
      avengeCutoff: null,
      sanction: null,
    });

    await store.recordKill({
      deathEventId: "death:revenge",
      killerCharacterId: avenger,
      victimCharacterId: killer,
      occurredAt: new Date(base),
      unjustified: false,
      avengeCutoff: new Date(base - 7 * 24 * 3_600_000),
      sanction: null,
    });

    const avengedRows = await pool.query<{ death_event_id: string }>(
      `SELECT death_event_id FROM character_kills
       WHERE killer_character_id = $1 AND avenged
       ORDER BY occurred_at`,
      [killer],
    );
    // Only the OLDEST unavenged kill is spent by the revenge.
    expect(avengedRows.rows.map((row) => row.death_event_id)).toEqual([
      "death:first",
    ]);
  });

  it("prunes frags older than the window on load and returns the rest", async () => {
    const [killer, victim] = await Promise.all([
      createCharacter("killer"),
      createCharacter("victim"),
    ]);
    const now = Date.now();
    await store.recordKill({
      deathEventId: "death:old",
      killerCharacterId: killer,
      victimCharacterId: victim,
      occurredAt: new Date(now - 40 * 24 * 3_600_000),
      unjustified: true,
      avengeCutoff: null,
      sanction: null,
    });
    await store.recordKill({
      deathEventId: "death:recent",
      killerCharacterId: killer,
      victimCharacterId: victim,
      occurredAt: new Date(now - 1_000),
      unjustified: true,
      avengeCutoff: null,
      sanction: null,
    });

    const frags = await store.loadFrags(
      killer,
      new Date(now - 30 * 24 * 3_600_000),
    );
    expect(frags).toHaveLength(1);
    expect(frags[0]?.victimCharacterId).toBe(victim);
    expect(await killRowCount()).toBe(1);
  });
});
