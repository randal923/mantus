import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { PgPromotionStore } from "./PgPromotionStore";

const TEST_SCHEMA = "promotion_store_integration";
const MIGRATION_LOCK_KEY = 7_281_015;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgPromotionStore;
let characterId: string;

databaseDescribe("PgPromotionStore integration", () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    setupClient = new Client({ connectionString: databaseUrl });
    await setupClient.connect();
    await setupClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
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
      "014_character_storages.sql",
      "015_depot_and_inbox.sql",
      "018_pvp.sql",
      "023_character_action_bar.sql",
      "029_character_potion_action_bar.sql",
      "030_vocation_promotion.sql",
      "031_minor_charm_echoes.sql",
      "032_remove_loose_inventory.sql",
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
    store = new PgPromotionStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM bank_ledger");
    await pool.query("DELETE FROM bank_accounts");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language)
       VALUES ($1, 'en') RETURNING id`,
      [`promotion-${randomUUID()}`],
    );
    const accountId = account.rows[0]?.id;
    if (!accountId) throw new Error("account insert returned no id");
    const characters = new PgCharacterStore(pool);
    await new CharacterService(characters, {
      x: 100,
      y: 200,
      z: 7,
      townId: 1,
    }).create(accountId, {
      displayName: "Promotion Hero",
      vocation: "Knight",
      lookType: 128,
    });
    const summary = (await characters.listByAccountId(accountId))[0];
    if (!summary) throw new Error("character was not created");
    characterId = summary.id;
    await pool.query(
      `WITH RECURSIVE owned AS (
         SELECT id FROM items WHERE character_id = $1
         UNION ALL
         SELECT child.id FROM items child JOIN owned ON child.container_id = owned.id
       )
       DELETE FROM items WHERE id IN (SELECT id FROM owned)`,
      [characterId],
    );
    await pool.query(
      "UPDATE characters SET level = 20 WHERE id = $1",
      [characterId],
    );
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, location_type, character_id, equipment_slot
       ) VALUES ($1, 2854, 'equipment', $2, 'backpack')`,
      [randomUUID(), characterId],
    );
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool.end();
    await setupClient.query("SET search_path TO public");
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  it("atomically spends carried and bank gold while promoting once", async () => {
    await pool.query(
      `INSERT INTO items (
         id, item_type_id, count, location_type, container_id, slot_index
       )
       SELECT $1, 3043, 1, 'container', id, 0
       FROM items
       WHERE character_id = $2 AND location_type = 'equipment'
         AND equipment_slot = 'backpack'`,
      [randomUUID(), characterId],
    );
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 10000)",
      [characterId],
    );

    const attempts = await Promise.allSettled([
      store.commit(characterId, 1, 20, 20_000, "king-tibianus"),
      store.commit(characterId, 1, 20, 20_000, "king-tibianus"),
    ]);

    expect(
      attempts.filter(
        (attempt) =>
          attempt.status === "fulfilled" &&
          attempt.value.status === "committed",
      ),
    ).toHaveLength(1);
    const character = await pool.query<{
      vocation: string;
      version: number;
      minor_charm_echoes: number;
      max_minor_charm_echoes: number;
    }>(
      `SELECT vocation, version, minor_charm_echoes, max_minor_charm_echoes
       FROM characters WHERE id = $1`,
      [characterId],
    );
    expect(character.rows[0]).toEqual({
      vocation: "Elite Knight",
      version: 2,
      minor_charm_echoes: 100,
      max_minor_charm_echoes: 100,
    });
    const bank = await pool.query<{ balance: string }>(
      "SELECT balance FROM bank_accounts WHERE character_id = $1",
      [characterId],
    );
    expect(bank.rows[0]?.balance).toBe("0");
    const crystal = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM items WHERE character_id = $1 AND item_type_id = 3043",
      [characterId],
    );
    expect(crystal.rows[0]?.count).toBe("0");
    const audits = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_log WHERE character_id = $1 AND event_type = 'vocation-promotion'",
      [characterId],
    );
    expect(audits.rows[0]?.count).toBe("1");
    const ledger = await pool.query<{ entry_type: string; amount: string }>(
      "SELECT entry_type, amount FROM bank_ledger WHERE character_id = $1",
      [characterId],
    );
    expect(ledger.rows).toEqual([
      { entry_type: "vocation-promotion", amount: "10000" },
    ]);
  });

  it("leaves vocation and balances unchanged when funds are insufficient", async () => {
    await pool.query(
      "INSERT INTO bank_accounts(character_id, balance) VALUES ($1, 19999)",
      [characterId],
    );

    await expect(
      store.commit(characterId, 1, 20, 20_000, "queen-eloise"),
    ).resolves.toEqual({ status: "insufficient-funds" });
    const character = await pool.query<{
      vocation: string;
      version: number;
      minor_charm_echoes: number;
      max_minor_charm_echoes: number;
    }>(
      `SELECT vocation, version, minor_charm_echoes, max_minor_charm_echoes
       FROM characters WHERE id = $1`,
      [characterId],
    );
    expect(character.rows[0]).toEqual({
      vocation: "Knight",
      version: 1,
      minor_charm_echoes: 0,
      max_minor_charm_echoes: 0,
    });
    const bank = await pool.query<{ balance: string }>(
      "SELECT balance FROM bank_accounts WHERE character_id = $1",
      [characterId],
    );
    expect(bank.rows[0]?.balance).toBe("19999");
  });
});
