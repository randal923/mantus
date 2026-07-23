import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { VIP_LIMITS } from "@tibia/protocol";
import { PgHighscoreStore } from "./PgHighscoreStore";
import { PgVipStore } from "./PgVipStore";

const TEST_SCHEMA = "social_store_integration";
const MIGRATION_LOCK_KEY = 7_281_020;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let vipStore: PgVipStore;
let highscoreStore: PgHighscoreStore;
let accountId: string;

const insertCharacter = async (
  name: string,
  overrides: {
    vocation?: string;
    experience?: number;
    level?: number;
    magicLevel?: number;
  } = {},
): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO characters (
       id, account_id, display_name, normalized_name, vocation,
       level, experience, magic_level, health, mana,
       position_x, position_y, position_z, direction,
       outfit_look_type, outfit_head, outfit_body, outfit_legs, outfit_feet,
       town_id
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, 150, 50,
       100, 100, 7, 'south',
       128, 1, 1, 1, 1,
       1
     )`,
    [
      id,
      accountId,
      name,
      name.toLowerCase(),
      overrides.vocation ?? "Knight",
      overrides.level ?? 1,
      overrides.experience ?? 0,
      overrides.magicLevel ?? 0,
    ],
  );
  return id;
};

const vipRowCount = async (characterId: string): Promise<number> => {
  const result = await pool.query<{ total: string }>(
    "SELECT count(*) AS total FROM character_vips WHERE character_id = $1",
    [characterId],
  );
  return Number(result.rows[0]?.total ?? 0);
};

databaseDescribe("Pg social stores integration", () => {
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
    ]) {
      await setupClient.query(
        await readFile(`${migrationsDirectory}${migration}`, "utf8"),
      );
    }
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
    vipStore = new PgVipStore(pool);
    highscoreStore = new PgHighscoreStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM character_vips");
    await pool.query("DELETE FROM character_skills");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language)
       VALUES ('social-integration', 'en')
       RETURNING id`,
    );
    const created = account.rows[0]?.id;
    if (!created) throw new Error("account insert returned no id");
    accountId = created;
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool?.end();
    await setupClient?.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient?.end();
  });

  it("rejects self-adds, duplicates, and unknown names at execution time", async () => {
    const alice = await insertCharacter("Alice");
    await insertCharacter("Bob");

    expect(
      await vipStore.addVip({
        characterId: alice,
        targetName: "Alice",
        maxEntries: VIP_LIMITS.maxEntries,
      }),
    ).toEqual({ status: "failed", reason: "cannot-add-self" });
    expect(
      await vipStore.addVip({
        characterId: alice,
        targetName: "Nobody",
        maxEntries: VIP_LIMITS.maxEntries,
      }),
    ).toEqual({ status: "failed", reason: "not-found" });
    const first = await vipStore.addVip({
      characterId: alice,
      targetName: "  bob  ",
      maxEntries: VIP_LIMITS.maxEntries,
    });
    expect(first.status).toBe("added");
    expect(
      await vipStore.addVip({
        characterId: alice,
        targetName: "Bob",
        maxEntries: VIP_LIMITS.maxEntries,
      }),
    ).toEqual({ status: "failed", reason: "already-added" });
    expect(await vipRowCount(alice)).toBe(1);
  });

  it("keeps racing adds from pushing a list past the 100-entry cap", async () => {
    const alice = await insertCharacter("Alice");
    const fillerIds: string[] = [];
    for (let index = 0; index < VIP_LIMITS.maxEntries - 1; index += 1) {
      fillerIds.push(await insertCharacter(`Filler ${toWords(index)}`));
    }
    await pool.query(
      `INSERT INTO character_vips (character_id, vip_character_id)
       SELECT $1, unnest($2::uuid[])`,
      [alice, fillerIds],
    );
    await insertCharacter("Last One");
    await insertCharacter("Last Two");

    const results = await Promise.all([
      vipStore.addVip({
        characterId: alice,
        targetName: "Last One",
        maxEntries: VIP_LIMITS.maxEntries,
      }),
      vipStore.addVip({
        characterId: alice,
        targetName: "Last Two",
        maxEntries: VIP_LIMITS.maxEntries,
      }),
    ]);
    const added = results.filter((result) => result.status === "added");
    const failed = results.filter((result) => result.status === "failed");
    expect(added).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toEqual({ status: "failed", reason: "list-full" });
    expect(await vipRowCount(alice)).toBe(VIP_LIMITS.maxEntries);
  });

  it("loads only the owner's private list", async () => {
    const alice = await insertCharacter("Alice");
    const bob = await insertCharacter("Bob");
    await insertCharacter("Carol", {
      vocation: "Master Sorcerer",
      level: 52,
      experience: 2_927_600,
    });
    await vipStore.addVip({
      characterId: alice,
      targetName: "Carol",
      maxEntries: VIP_LIMITS.maxEntries,
    });
    await vipStore.addVip({
      characterId: bob,
      targetName: "Alice",
      maxEntries: VIP_LIMITS.maxEntries,
    });

    const aliceEntries = await vipStore.loadEntries(alice);
    const bobEntries = await vipStore.loadEntries(bob);
    expect(aliceEntries.map((entry) => entry.name)).toEqual(["Carol"]);
    expect(aliceEntries[0]).toMatchObject({
      name: "Carol",
      level: 52,
      vocation: "Master Sorcerer",
    });
    expect(bobEntries.map((entry) => entry.name)).toEqual(["Alice"]);
  });

  it("serves bounded ranked pages with only public fields", async () => {
    await insertCharacter("Alice", {
      vocation: "Knight",
      level: 30,
      experience: 100_000,
    });
    await insertCharacter("Bob", {
      vocation: "Sorcerer",
      level: 20,
      experience: 40_000,
      magicLevel: 50,
    });
    await insertCharacter("Carol", {
      vocation: "Knight",
      level: 25,
      experience: 60_000,
    });

    const page = await highscoreStore.loadPage({
      category: "experience",
      vocation: null,
      page: 0,
    });
    expect(page.totalEntries).toBe(3);
    expect(page.rows.map((row) => row.name)).toEqual([
      "Alice",
      "Carol",
      "Bob",
    ]);
    expect(page.rows[0]).toEqual({
      name: "Alice",
      level: 30,
      vocation: "Knight",
      value: 100_000,
    });
    expect(Object.keys(page.rows[0] ?? {}).sort()).toEqual([
      "level",
      "name",
      "value",
      "vocation",
    ]);

    const knights = await highscoreStore.loadPage({
      category: "experience",
      vocation: "Knight",
      page: 0,
    });
    expect(knights.rows.map((row) => row.name)).toEqual(["Alice", "Carol"]);

    const deepPage = await highscoreStore.loadPage({
      category: "experience",
      vocation: null,
      page: 19,
    });
    expect(deepPage.rows).toHaveLength(0);
  });

  it("ranks skill categories from the skills table", async () => {
    const alice = await insertCharacter("Alice");
    const bob = await insertCharacter("Bob");
    await pool.query(
      `INSERT INTO character_skills (character_id, skill, level, tries)
       VALUES ($1, 'sword', 70, 100), ($2, 'sword', 55, 100)`,
      [alice, bob],
    );

    const page = await highscoreStore.loadPage({
      category: "sword",
      vocation: null,
      page: 0,
    });
    expect(page.rows.map((row) => [row.name, row.value])).toEqual([
      ["Alice", 70],
      ["Bob", 55],
    ]);
  });
});

/** Spells 0..98 as letters so display names satisfy the name format check. */
function toWords(index: number): string {
  const letters = "abcdefghij";
  return [...String(index)]
    .map((digit) => letters[Number(digit)])
    .join("")
    .padEnd(2, "z");
}
