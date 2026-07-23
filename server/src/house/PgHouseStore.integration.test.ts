import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { PgHouseStore } from "./PgHouseStore";

const TEST_SCHEMA = "house_store_integration";
const MIGRATION_LOCK_KEY = 7_281_019;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

const MAP_NAME = "housetest";
const GOLD_TYPE = 3031; // pickupable + movable
const VOID_TYPE = 100; // neither pickupable nor movable
const HOUSE_TILES = [
  { x: 100, y: 100, z: 7 },
  { x: 100, y: 101, z: 7 },
];
const DAY_MS = 24 * 3600 * 1000;
const PERIOD_MS = 30 * DAY_MS;

let setupClient: Client;
let pool: Pool;
let store: PgHouseStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

let characterSerial = 0;

const alphaSuffix = (): string => {
  characterSerial += 1;
  let remaining = characterSerial;
  let suffix = "";
  while (remaining > 0) {
    suffix = String.fromCharCode(97 + ((remaining - 1) % 26)) + suffix;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return suffix;
};

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`house-integration-${label}-${randomUUID()}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Tenant ${alphaSuffix()}`,
    vocation: "Knight",
    lookType: 128,
  });
  const summaries = await characterStore.listByAccountId(accountId);
  const summary = summaries[summaries.length - 1];
  if (!summary) throw new Error("character was not created");
  return summary.id;
};

const setBalance = async (characterId: string, balance: number) => {
  await pool.query(
    `INSERT INTO bank_accounts (character_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (character_id) DO UPDATE SET balance = $2`,
    [characterId, balance],
  );
};

const balanceOf = async (characterId: string): Promise<number> => {
  const result = await pool.query<{ balance: string }>(
    "SELECT balance FROM bank_accounts WHERE character_id = $1",
    [characterId],
  );
  return Number(result.rows[0]?.balance ?? 0);
};

const globalGoldTotal = async (): Promise<number> => {
  const result = await pool.query<{ total: string }>(
    "SELECT COALESCE(SUM(balance), 0) AS total FROM bank_accounts",
  );
  return Number(result.rows[0]?.total ?? 0);
};

const globalItemTotal = async (typeId: number): Promise<number> => {
  const result = await pool.query<{ total: string }>(
    "SELECT COALESCE(SUM(count), 0) AS total FROM items WHERE item_type_id = $1",
    [typeId],
  );
  return Number(result.rows[0]?.total ?? 0);
};

const placeWorldItem = async (
  typeId: number,
  tile: { x: number; y: number; z: number },
  stackIndex: number,
): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO items (
       id, item_type_id, count, location_type, world_map_name,
       world_x, world_y, world_z, world_stack_index
     ) VALUES ($1, $2, 1, 'world', $3, $4, $5, $6, $7)`,
    [id, typeId, MAP_NAME, tile.x, tile.y, tile.z, stackIndex],
  );
  return id;
};

const inboxItemIds = async (characterId: string): Promise<string[]> => {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM items
     WHERE character_id = $1 AND location_type = 'inbox'
     ORDER BY slot_index`,
    [characterId],
  );
  return result.rows.map((row) => row.id);
};

const houseRow = async (houseId: number) => {
  const result = await pool.query<{
    owner_character_id: string;
    tenancy_id: string;
    paid_until: Date;
    rent_warnings: number;
  }>(
    `SELECT owner_character_id, tenancy_id, paid_until, rent_warnings
     FROM houses WHERE house_id = $1`,
    [houseId],
  );
  return result.rows[0] ?? null;
};

const auditCount = async (eventType: string): Promise<number> => {
  const result = await pool.query<{ total: string }>(
    "SELECT count(*) AS total FROM audit_log WHERE event_type = $1",
    [eventType],
  );
  return Number(result.rows[0]?.total ?? 0);
};

const ledgerCount = async (entryType: string): Promise<number> => {
  const result = await pool.query<{ total: string }>(
    "SELECT count(*) AS total FROM bank_ledger WHERE entry_type = $1",
    [entryType],
  );
  return Number(result.rows[0]?.total ?? 0);
};

databaseDescribe("PgHouseStore integration", () => {
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
    store = new PgHouseStore(pool, await loadItemCatalog());
  });

  beforeEach(async () => {
    if (!databaseUrl) return;
    await pool.query("DELETE FROM inbox_deliveries");
    await pool.query("DELETE FROM house_access");
    await pool.query("DELETE FROM houses");
    await pool.query("DELETE FROM items");
    await pool.query("DELETE FROM bank_ledger");
    await pool.query("DELETE FROM audit_log");
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool?.end();
    await setupClient.query("SET search_path TO public");
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  it("lets exactly one of two racing buyers purchase and debits once", async () => {
    const first = await createCharacter("race-a");
    const second = await createCharacter("race-b");
    await setBalance(first, 100_000);
    await setBalance(second, 100_000);
    const goldBefore = await globalGoldTotal();

    const results = await Promise.allSettled([
      store.purchase({
        houseId: 11,
        characterId: first,
        price: 20_000,
        paidUntilMs: Date.now() + PERIOD_MS,
      }),
      store.purchase({
        houseId: 11,
        characterId: second,
        price: 20_000,
        paidUntilMs: Date.now() + PERIOD_MS,
      }),
    ]);
    const settled = results.map((result) =>
      result.status === "fulfilled" ? result.value : { status: "failed" },
    );
    const wins = settled.filter((result) => result.status === "purchased");
    expect(wins).toHaveLength(1);

    const row = await houseRow(11);
    expect(row).not.toBeNull();
    // Exactly one buyer paid; the loser kept every coin.
    expect(await globalGoldTotal()).toBe(goldBefore - 20_000);
    expect((await balanceOf(first)) + (await balanceOf(second))).toBe(
      180_000,
    );
    expect(await auditCount("house-purchase")).toBe(1);
    expect(await ledgerCount("house-purchase")).toBe(1);
  });

  it("refuses a purchase that would overdraw and one buyer owning two houses", async () => {
    const buyer = await createCharacter("poor");
    await setBalance(buyer, 5_000);
    const broke = await store.purchase({
      houseId: 12,
      characterId: buyer,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(broke).toEqual({ status: "failed", reason: "insufficient-funds" });
    expect(await houseRow(12)).toBeNull();
    expect(await balanceOf(buyer)).toBe(5_000);

    await setBalance(buyer, 100_000);
    const one = await store.purchase({
      houseId: 12,
      characterId: buyer,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(one.status).toBe("purchased");
    const two = await store.purchase({
      houseId: 13,
      characterId: buyer,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(two).toEqual({ status: "failed", reason: "own-house-exists" });
    expect(await balanceOf(buyer)).toBe(80_000);
  });

  it("transfers with atomic two-way money legs and moves items to the seller's inbox", async () => {
    const seller = await createCharacter("seller");
    const buyer = await createCharacter("buyer");
    await setBalance(seller, 50_000);
    await setBalance(buyer, 80_000);
    const purchased = await store.purchase({
      houseId: 21,
      characterId: seller,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(purchased.status).toBe("purchased");
    await store.setAccess({
      houseId: 21,
      actorCharacterId: seller,
      kind: "guest",
      targetName: (await pool.query<{ display_name: string }>(
        "SELECT display_name FROM characters WHERE id = $1",
        [buyer],
      )).rows[0]!.display_name,
      grant: true,
      maxEntries: 100,
    });
    const movable = await placeWorldItem(GOLD_TYPE, HOUSE_TILES[0]!, 1);
    const fixture = await placeWorldItem(VOID_TYPE, HOUSE_TILES[1]!, 1);
    const goldBefore = await globalGoldTotal();
    const itemsBefore = await globalItemTotal(GOLD_TYPE);

    const result = await store.transfer({
      houseId: 21,
      fromCharacterId: seller,
      toCharacterId: buyer,
      price: 50_000,
      paidUntilMs: Date.now() + PERIOD_MS,
      mapName: MAP_NAME,
      tilePositions: HOUSE_TILES,
    });
    expect(result.status).toBe("transferred");
    expect(await balanceOf(buyer)).toBe(30_000);
    expect(await balanceOf(seller)).toBe(80_000);
    expect(await globalGoldTotal()).toBe(goldBefore);
    expect(await globalItemTotal(GOLD_TYPE)).toBe(itemsBefore);
    expect(await inboxItemIds(seller)).toEqual([movable]);
    // The immovable fixture stayed on its tile.
    const fixtureRow = await pool.query<{ location_type: string }>(
      "SELECT location_type FROM items WHERE id = $1",
      [fixture],
    );
    expect(fixtureRow.rows[0]?.location_type).toBe("world");
    const row = await houseRow(21);
    expect(row?.owner_character_id).toBe(buyer);
    // Access lists were cleared for the new tenancy.
    const access = await pool.query(
      "SELECT 1 FROM house_access WHERE house_id = 21",
    );
    expect(access.rowCount).toBe(0);
    expect(await ledgerCount("house-transfer-in")).toBe(1);
    expect(await ledgerCount("house-transfer-out")).toBe(1);
    expect(await auditCount("house-transfer")).toBe(1);
  });

  it("resolves a transfer racing an abandon to exactly one outcome", async () => {
    const seller = await createCharacter("race-seller");
    const buyer = await createCharacter("race-buyer");
    await setBalance(seller, 30_000);
    await setBalance(buyer, 60_000);
    const purchased = await store.purchase({
      houseId: 31,
      characterId: seller,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(purchased.status).toBe("purchased");
    const goldBefore = await globalGoldTotal();

    const [transferred, abandoned] = await Promise.allSettled([
      store.transfer({
        houseId: 31,
        fromCharacterId: seller,
        toCharacterId: buyer,
        price: 40_000,
        paidUntilMs: Date.now() + PERIOD_MS,
        mapName: MAP_NAME,
        tilePositions: HOUSE_TILES,
      }),
      store.abandon({
        houseId: 31,
        ownerCharacterId: seller,
        mapName: MAP_NAME,
        tilePositions: HOUSE_TILES,
      }),
    ]);
    const transferOk =
      transferred.status === "fulfilled" &&
      transferred.value.status === "transferred";
    const abandonOk =
      abandoned.status === "fulfilled" &&
      abandoned.value.status === "abandoned";
    expect(transferOk !== abandonOk).toBe(true);
    const row = await houseRow(31);
    if (transferOk) {
      expect(row?.owner_character_id).toBe(buyer);
      expect(await globalGoldTotal()).toBe(goldBefore);
      expect(await balanceOf(buyer)).toBe(20_000);
    } else {
      expect(row).toBeNull();
      expect(await globalGoldTotal()).toBe(goldBefore);
      expect(await balanceOf(buyer)).toBe(60_000);
    }
  });

  it("charges due rent exactly once across replays and concurrent scans", async () => {
    const owner = await createCharacter("renter");
    await setBalance(owner, 100_000);
    const purchased = await store.purchase({
      houseId: 41,
      characterId: owner,
      price: 20_000,
      paidUntilMs: Date.now() - 1000,
    });
    expect(purchased.status).toBe("purchased");
    const now = new Date();
    const input = {
      houseId: 41,
      rent: 5_000,
      now,
      rentPeriodMs: PERIOD_MS,
      warningGraceMs: DAY_MS,
      maxWarnings: 7,
      mapName: MAP_NAME,
      tilePositions: HOUSE_TILES,
    };

    expect(await store.listDueHouseIds(now, 10)).toEqual([41]);
    const [first, second] = await Promise.all([
      store.chargeRent(input),
      store.chargeRent(input),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["paid", "skip"]);
    // Replaying the same due charge after commit is a no-op.
    expect((await store.chargeRent(input)).status).toBe("skip");
    expect(await balanceOf(owner)).toBe(75_000);
    expect(await ledgerCount("house-rent")).toBe(1);
    expect(await auditCount("house-rent")).toBe(1);
    const row = await houseRow(41);
    expect(row?.paid_until.getTime()).toBeGreaterThan(now.getTime());
    expect(await store.listDueHouseIds(now, 10)).toEqual([]);
  });

  it("warns while broke, then evicts and delivers every item exactly once", async () => {
    const owner = await createCharacter("evictee");
    await setBalance(owner, 20_000);
    const purchased = await store.purchase({
      houseId: 51,
      characterId: owner,
      price: 20_000,
      paidUntilMs: Date.now() - 1000,
    });
    expect(purchased.status).toBe("purchased");
    const movable = await placeWorldItem(GOLD_TYPE, HOUSE_TILES[0]!, 1);
    const itemsBefore = await globalItemTotal(GOLD_TYPE);
    const base = {
      houseId: 51,
      rent: 5_000,
      rentPeriodMs: PERIOD_MS,
      warningGraceMs: DAY_MS,
      maxWarnings: 2,
      mapName: MAP_NAME,
      tilePositions: HOUSE_TILES,
    };

    const warned = await store.chargeRent({ ...base, now: new Date() });
    expect(warned.status).toBe("warned");
    // Within the grace window nothing happens.
    expect(
      (await store.chargeRent({ ...base, now: new Date() })).status,
    ).toBe("skip");
    const afterGrace = new Date(Date.now() + DAY_MS + 1000);
    const evicted = await store.chargeRent({ ...base, now: afterGrace });
    expect(evicted.status).toBe("evicted");
    expect(await houseRow(51)).toBeNull();
    expect(await inboxItemIds(owner)).toEqual([movable]);
    expect(await globalItemTotal(GOLD_TYPE)).toBe(itemsBefore);
    expect(await auditCount("house-eviction")).toBe(1);
    // Replays after the eviction are no-ops.
    expect(
      (await store.chargeRent({ ...base, now: afterGrace })).status,
    ).toBe("skip");
    expect(await inboxItemIds(owner)).toEqual([movable]);
  });

  it("skips items whose eviction delivery key was already consumed", async () => {
    const owner = await createCharacter("replayed");
    await setBalance(owner, 20_000);
    const purchased = await store.purchase({
      houseId: 61,
      characterId: owner,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(purchased.status).toBe("purchased");
    const delivered = await placeWorldItem(GOLD_TYPE, HOUSE_TILES[0]!, 1);
    const replayed = await placeWorldItem(GOLD_TYPE, HOUSE_TILES[0]!, 2);
    const row = await houseRow(61);
    // Simulate a previous crash-retry that already consumed this item's key.
    await pool.query(
      `INSERT INTO inbox_deliveries (
         delivery_key, delivery_kind, recipient_character_id, item_id,
         original_item_id
       ) VALUES ($1, 'system', $2, null, $3)`,
      [`house-evict:61:${row!.tenancy_id}:${replayed}`, owner, replayed],
    );

    const abandoned = await store.abandon({
      houseId: 61,
      ownerCharacterId: owner,
      mapName: MAP_NAME,
      tilePositions: HOUSE_TILES,
    });
    expect(abandoned.status).toBe("abandoned");
    // Only the fresh item moved; the already-delivered key was not replayed
    // into a second copy.
    expect(await inboxItemIds(owner)).toEqual([delivered]);
    expect(await globalItemTotal(GOLD_TYPE)).toBe(2);
  });

  it("enforces owner/subowner authorization for access edits in the transaction", async () => {
    const owner = await createCharacter("landlord");
    const friend = await createCharacter("friend");
    const stranger = await createCharacter("stranger");
    await setBalance(owner, 30_000);
    const purchased = await store.purchase({
      houseId: 71,
      characterId: owner,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(purchased.status).toBe("purchased");
    const nameOf = async (characterId: string) =>
      (
        await pool.query<{ display_name: string }>(
          "SELECT display_name FROM characters WHERE id = $1",
          [characterId],
        )
      ).rows[0]!.display_name;

    const denied = await store.setAccess({
      houseId: 71,
      actorCharacterId: stranger,
      kind: "guest",
      targetName: await nameOf(friend),
      grant: true,
      maxEntries: 100,
    });
    expect(denied).toEqual({ status: "failed", reason: "not-authorized" });

    const subowner = await store.setAccess({
      houseId: 71,
      actorCharacterId: owner,
      kind: "subowner",
      targetName: await nameOf(friend),
      grant: true,
      maxEntries: 100,
    });
    expect(subowner.status).toBe("ok");
    // A subowner may curate guests but never other subowners.
    const guestBySubowner = await store.setAccess({
      houseId: 71,
      actorCharacterId: friend,
      kind: "guest",
      targetName: await nameOf(stranger),
      grant: true,
      maxEntries: 100,
    });
    expect(guestBySubowner.status).toBe("ok");
    const subownerBySubowner = await store.setAccess({
      houseId: 71,
      actorCharacterId: friend,
      kind: "subowner",
      targetName: await nameOf(stranger),
      grant: true,
      maxEntries: 100,
    });
    expect(subownerBySubowner).toEqual({
      status: "failed",
      reason: "not-authorized",
    });
    const snapshot = await store.loadSnapshot(71);
    expect(snapshot?.subowners.map((entry) => entry.characterId)).toEqual([
      friend,
    ]);
    expect(snapshot?.guests.map((entry) => entry.characterId)).toEqual([
      stranger,
    ]);
  });
});
