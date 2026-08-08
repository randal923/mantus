import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { applyMigrations } from "../test/applyMigrations";
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
    sex: "male",
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

/** Makes a character pass the close-time eligibility re-read. */
const setEligible = async (characterId: string, level = 100) => {
  await pool.query("UPDATE characters SET level = $2 WHERE id = $1", [
    characterId,
    level,
  ]);
  await pool.query(
    `UPDATE accounts SET premium_until = now() + interval '30 days'
     WHERE id = (SELECT account_id FROM characters WHERE id = $1)`,
    [characterId],
  );
};

/** Pins the owner's absence anchor, as the durable save loop would. */
const setLastSeen = async (characterId: string, lastSeenAt: Date) => {
  await pool.query("UPDATE characters SET last_seen_at = $2 WHERE id = $1", [
    characterId,
    lastSeenAt,
  ]);
};

const setPremiumUntil = async (
  characterId: string,
  premiumUntil: Date | null,
) => {
  await pool.query(
    `UPDATE accounts SET premium_until = $2
     WHERE id = (SELECT account_id FROM characters WHERE id = $1)`,
    [characterId, premiumUntil],
  );
};

const ABSENCE_THRESHOLDS = {
  warnAfterDays: 5,
  evictAfterDays: 7,
  premiumEvictAfterDays: 10,
};

const auctionRow = async (houseId: number) => {
  const result = await pool.query<{ bidder_character_id: string; bid: string }>(
    "SELECT bidder_character_id, bid FROM house_auctions WHERE house_id = $1",
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
    await applyMigrations(setupClient);
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
    await pool.query("DELETE FROM house_auctions");
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
      warningLetterText: (left: number) => `warning, ${left} left`,
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
      warningLetterText: (left: number) => `warning, ${left} left`,
    };

    const warned = await store.chargeRent({ ...base, now: new Date() });
    expect(warned.status).toBe("warned");
    // The warning mailed exactly one stamped letter carrying its text.
    const letters = await pool.query<{ id: string; attributes: unknown }>(
      `SELECT id, attributes FROM items
       WHERE character_id = $1 AND item_type_id = 3506`,
      [owner],
    );
    expect(letters.rows).toHaveLength(1);
    expect(letters.rows[0]?.attributes).toEqual({ text: "warning, 1 left" });
    // Within the grace window nothing happens.
    expect(
      (await store.chargeRent({ ...base, now: new Date() })).status,
    ).toBe("skip");
    const afterGrace = new Date(Date.now() + DAY_MS + 1000);
    const evicted = await store.chargeRent({ ...base, now: afterGrace });
    expect(evicted.status).toBe("evicted");
    expect(await houseRow(51)).toBeNull();
    const letterId = letters.rows[0]!.id;
    expect(await inboxItemIds(owner)).toEqual([letterId, movable]);
    expect(await globalItemTotal(GOLD_TYPE)).toBe(itemsBefore);
    expect(await auditCount("house-eviction")).toBe(1);
    // Replays after the eviction are no-ops.
    expect(
      (await store.chargeRent({ ...base, now: afterGrace })).status,
    ).toBe("skip");
    expect(await inboxItemIds(owner)).toEqual([letterId, movable]);
  });

  it("warns an absent free owner once per episode, then evicts past 7 days with an audit trail", async () => {
    const owner = await createCharacter("absentee");
    await setBalance(owner, 20_000);
    const purchased = await store.purchase({
      houseId: 55,
      characterId: owner,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(purchased.status).toBe("purchased");
    const movable = await placeWorldItem(GOLD_TYPE, HOUSE_TILES[0]!, 1);
    const itemsBefore = await globalItemTotal(GOLD_TYPE);
    await setPremiumUntil(owner, new Date(Date.now() - DAY_MS));
    const loggedOutAt = new Date();
    await setLastSeen(owner, loggedOutAt);
    const base = {
      houseId: 55,
      ...ABSENCE_THRESHOLDS,
      mapName: MAP_NAME,
      tilePositions: HOUSE_TILES,
      warningLetterText: (left: number) => `absence, ${left} left`,
    };
    const at = (days: number) =>
      new Date(loggedOutAt.getTime() + days * DAY_MS);

    // Day 4: below the warning threshold, nothing is due.
    expect(
      await store.listAbsenceDueHouseIds({
        now: at(4),
        ...ABSENCE_THRESHOLDS,
        limit: 10,
      }),
    ).toEqual([]);
    expect((await store.processAbsence({ ...base, now: at(4) })).status).toBe(
      "skip",
    );

    // Day 5: due for its warning; the letter is mailed exactly once and the
    // house drops back out of the due list until eviction.
    expect(
      await store.listAbsenceDueHouseIds({
        now: at(5),
        ...ABSENCE_THRESHOLDS,
        limit: 10,
      }),
    ).toEqual([55]);
    const warned = await store.processAbsence({ ...base, now: at(5) });
    expect(warned.status).toBe("warned");
    const letters = await pool.query<{ id: string; attributes: unknown }>(
      `SELECT id, attributes FROM items
       WHERE character_id = $1 AND item_type_id = 3506`,
      [owner],
    );
    expect(letters.rows).toHaveLength(1);
    expect(letters.rows[0]?.attributes).toEqual({ text: "absence, 2 left" });
    expect(
      await store.listAbsenceDueHouseIds({
        now: at(5),
        ...ABSENCE_THRESHOLDS,
        limit: 10,
      }),
    ).toEqual([]);
    expect((await store.processAbsence({ ...base, now: at(5) })).status).toBe(
      "skip",
    );

    // Day 7 exactly: evicted, movables mailed home, audited as absence.
    expect(
      await store.listAbsenceDueHouseIds({
        now: at(7),
        ...ABSENCE_THRESHOLDS,
        limit: 10,
      }),
    ).toEqual([55]);
    const evicted = await store.processAbsence({ ...base, now: at(7) });
    expect(evicted.status).toBe("evicted");
    expect(await houseRow(55)).toBeNull();
    const letterId = letters.rows[0]!.id;
    expect(await inboxItemIds(owner)).toEqual([letterId, movable]);
    expect(await globalItemTotal(GOLD_TYPE)).toBe(itemsBefore);
    expect(await auditCount("house-eviction")).toBe(1);
    const audit = await pool.query<{ details: { reason?: string } }>(
      "SELECT details FROM audit_log WHERE event_type = 'house-eviction'",
    );
    expect(audit.rows[0]?.details.reason).toBe("absence");
    // Replays after the eviction are no-ops.
    expect((await store.processAbsence({ ...base, now: at(7) })).status).toBe(
      "skip",
    );
    expect(await inboxItemIds(owner)).toEqual([letterId, movable]);
  });

  it("gives premium owners 10 days and judges the tier at scan time", async () => {
    const keeper = await createCharacter("premium-keeper");
    const lapsed = await createCharacter("premium-lapsed");
    await setBalance(keeper, 20_000);
    await setBalance(lapsed, 20_000);
    for (const [houseId, owner] of [
      [56, keeper],
      [57, lapsed],
    ] as const) {
      const purchased = await store.purchase({
        houseId,
        characterId: owner,
        price: 20_000,
        paidUntilMs: Date.now() + PERIOD_MS,
      });
      expect(purchased.status).toBe("purchased");
    }
    const loggedOutAt = new Date(Date.now() - 8 * DAY_MS);
    await setLastSeen(keeper, loggedOutAt);
    await setLastSeen(lapsed, loggedOutAt);
    await setPremiumUntil(keeper, new Date(Date.now() + PERIOD_MS));
    // Premium covered most of the absence but is over at scan time.
    await setPremiumUntil(lapsed, new Date(Date.now() - 3600 * 1000));
    const base = {
      ...ABSENCE_THRESHOLDS,
      mapName: MAP_NAME,
      tilePositions: HOUSE_TILES,
      warningLetterText: (left: number) => `absence, ${left} left`,
    };

    // Eight days absent: the premium owner is only warned...
    const keeperResult = await store.processAbsence({
      ...base,
      houseId: 56,
      now: new Date(),
    });
    expect(keeperResult.status).toBe("warned");
    expect(await houseRow(56)).not.toBeNull();
    // ...while the lapsed owner is judged by the free 7-day rule.
    const lapsedResult = await store.processAbsence({
      ...base,
      houseId: 57,
      now: new Date(),
    });
    expect(lapsedResult.status).toBe("evicted");
    expect(await houseRow(57)).toBeNull();

    // Ten days absent evicts even the premium owner.
    const tenDays = new Date(loggedOutAt.getTime() + 10 * DAY_MS);
    const keeperEvicted = await store.processAbsence({
      ...base,
      houseId: 56,
      now: tenDays,
    });
    expect(keeperEvicted.status).toBe("evicted");
    expect(await houseRow(56)).toBeNull();
  });

  it("never lists a guildhall as absence-due", async () => {
    const leader = await createCharacter("absent-leader");
    const guild = await pool.query<{ id: string }>(
      `INSERT INTO guilds (name, owner_character_id, balance)
       VALUES ($1, $2, 300000)
       RETURNING id`,
      [`Idle Hands ${alphaSuffix()}`, leader],
    );
    const bought = await store.purchaseGuildhall({
      houseId: 58,
      characterId: leader,
      guildId: guild.rows[0]!.id,
      price: 100_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(bought.status).toBe("purchased");
    await setPremiumUntil(leader, new Date(Date.now() - DAY_MS));
    await setLastSeen(leader, new Date(Date.now() - 30 * DAY_MS));

    expect(
      await store.listAbsenceDueHouseIds({
        now: new Date(),
        ...ABSENCE_THRESHOLDS,
        limit: 10,
      }),
    ).toEqual([]);
    const result = await store.processAbsence({
      houseId: 58,
      now: new Date(),
      ...ABSENCE_THRESHOLDS,
      mapName: MAP_NAME,
      tilePositions: HOUSE_TILES,
      warningLetterText: () => "unused",
    });
    expect(result.status).toBe("skip");
    expect(await houseRow(58)).not.toBeNull();
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

  it("buys a guildhall from the guild balance and rejects non-leaders", async () => {
    const leader = await createCharacter("hall-leader");
    const member = await createCharacter("hall-member");
    const guild = await pool.query<{ id: string }>(
      `INSERT INTO guilds (name, owner_character_id, balance)
       VALUES ($1, $2, 300000)
       RETURNING id`,
      [`Red Rose ${alphaSuffix()}`, leader],
    );
    const guildId = guild.rows[0]!.id;
    await setBalance(leader, 100_000);
    const personalGoldBefore = await globalGoldTotal();

    // A member cannot spend the guild's gold, even with the right guild id.
    expect(
      await store.purchaseGuildhall({
        houseId: 95,
        characterId: member,
        guildId,
        price: 100_000,
        paidUntilMs: Date.now() + PERIOD_MS,
      }),
    ).toEqual({ status: "failed", reason: "not-authorized" });

    const bought = await store.purchaseGuildhall({
      houseId: 95,
      characterId: leader,
      guildId,
      price: 100_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(bought.status).toBe("purchased");
    const guildBalance = async () =>
      Number(
        (
          await pool.query<{ balance: string }>(
            "SELECT balance FROM guilds WHERE id = $1",
            [guildId],
          )
        ).rows[0]?.balance ?? 0,
      );
    expect(await guildBalance()).toBe(200_000);
    // Personal bank accounts are untouched by a guildhall purchase.
    expect(await globalGoldTotal()).toBe(personalGoldBefore);

    // The leader may still own a personal house: the unique index is partial.
    const personal = await store.purchase({
      houseId: 96,
      characterId: leader,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    expect(personal.status).toBe("purchased");

    // One guildhall per guild, enforced by the partial unique index.
    expect(
      await store.purchaseGuildhall({
        houseId: 97,
        characterId: leader,
        guildId,
        price: 1_000,
        paidUntilMs: Date.now() + PERIOD_MS,
      }),
    ).toEqual({ status: "failed", reason: "own-house-exists" });
    expect(await guildBalance()).toBe(200_000);

    // Rent for a guildhall comes out of the guild balance too.
    await pool.query(
      "UPDATE houses SET paid_until = now() - interval '1 day' WHERE house_id = 95",
    );
    const charged = await store.chargeRent({
      houseId: 95,
      rent: 50_000,
      now: new Date(),
      rentPeriodMs: PERIOD_MS,
      warningGraceMs: DAY_MS,
      maxWarnings: 7,
      mapName: MAP_NAME,
      tilePositions: [],
      warningLetterText: (left: number) => `warning, ${left} left`,
    });
    expect(charged.status).toBe("paid");
    expect(await guildBalance()).toBe(150_000);
    expect(await globalGoldTotal()).toBe(personalGoldBefore - 20_000);
  });

  it("stores text lists per house/door and gates who may edit which", async () => {
    const owner = await createCharacter("list-owner");
    const helper = await createCharacter("list-helper");
    const stranger = await createCharacter("list-stranger");
    await setBalance(owner, 30_000);
    await store.purchase({
      houseId: 91,
      characterId: owner,
      price: 20_000,
      paidUntilMs: Date.now() + PERIOD_MS,
    });
    const helperName = (
      await pool.query<{ display_name: string }>(
        "SELECT display_name FROM characters WHERE id = $1",
        [helper],
      )
    ).rows[0]!.display_name;
    await store.setAccess({
      houseId: 91,
      actorCharacterId: owner,
      kind: "subowner",
      targetName: helperName,
      grant: true,
      maxEntries: 100,
    });

    expect(
      await store.setTextList({
        houseId: 91,
        actorCharacterId: stranger,
        kind: "guest",
        body: "@Red Rose",
        maxDoorLists: 64,
      }),
    ).toEqual({ status: "failed", reason: "not-authorized" });
    // A subowner curates guests and doors but never the subowner list.
    expect(
      await store.setTextList({
        houseId: 91,
        actorCharacterId: helper,
        kind: "subowner",
        body: "@Red Rose",
        maxDoorLists: 64,
      }),
    ).toEqual({ status: "failed", reason: "not-authorized" });

    await store.setTextList({
      houseId: 91,
      actorCharacterId: helper,
      kind: "guest",
      body: "@Red Rose",
      maxDoorLists: 64,
    });
    await store.setTextList({
      houseId: 91,
      actorCharacterId: owner,
      kind: "door",
      body: "Leader@Red Rose",
      door: { x: 100, y: 100, z: 7 },
      maxDoorLists: 64,
    });
    const snapshot = await store.loadSnapshot(91);
    expect(snapshot?.textLists).toEqual([
      { kind: "guest", body: "@Red Rose" },
      {
        kind: "door",
        body: "Leader@Red Rose",
        door: { x: 100, y: 100, z: 7 },
      },
    ]);

    // An empty body deletes the list rather than storing a blank one.
    await store.setTextList({
      houseId: 91,
      actorCharacterId: owner,
      kind: "guest",
      body: "  ",
      maxDoorLists: 64,
    });
    expect((await store.loadSnapshot(91))?.textLists).toHaveLength(1);

    // A door list may not outnumber its cap.
    expect(
      await store.setTextList({
        houseId: 91,
        actorCharacterId: owner,
        kind: "door",
        body: "Bob",
        door: { x: 100, y: 101, z: 7 },
        maxDoorLists: 1,
      }),
    ).toEqual({ status: "failed", reason: "access-limit" });
  });

  it("resolves racing bids to exactly one winner and conserves gold", async () => {
    const first = await createCharacter("bid-a");
    const second = await createCharacter("bid-b");
    await setBalance(first, 100_000);
    await setBalance(second, 100_000);
    const goldBefore = await globalGoldTotal();
    const now = new Date();

    const results = await Promise.allSettled([
      store.placeBid({
        houseId: 81,
        characterId: first,
        amount: 20_000,
        minimumBid: 20_000,
        minIncrement: 1_000,
        endsAtMs: now.getTime() + DAY_MS,
        now,
      }),
      store.placeBid({
        houseId: 81,
        characterId: second,
        amount: 20_000,
        minimumBid: 20_000,
        minIncrement: 1_000,
        endsAtMs: now.getTime() + DAY_MS,
        now,
      }),
    ]);
    const accepted = results.filter(
      (result) => result.status === "fulfilled" && result.value.status === "bid",
    );
    // Both bids are 20_000, so whichever lands second cannot reach the
    // increment floor: exactly one opens the auction.
    expect(accepted).toHaveLength(1);
    const row = await auctionRow(81);
    expect(row).not.toBeNull();
    // The escrow left exactly one bank account; nothing was minted.
    expect(await globalGoldTotal()).toBe(goldBefore - 20_000);
    expect(await ledgerCount("house-bid-escrow")).toBe(1);

    // The loser outbids and gets the standing escrow back in the same
    // transaction that takes theirs.
    const loser = row!.bidder_character_id === first ? second : first;
    const outbid = await store.placeBid({
      houseId: 81,
      characterId: loser,
      amount: 30_000,
      minimumBid: 20_000,
      minIncrement: 1_000,
      endsAtMs: now.getTime() + DAY_MS,
      now,
    });
    expect(outbid.status).toBe("bid");
    expect(await globalGoldTotal()).toBe(goldBefore - 30_000);
    expect((await balanceOf(first)) + (await balanceOf(second))).toBe(170_000);
    expect(await auditCount("house-auction-bid")).toBe(2);
  });

  it("settles a due auction exactly once across replays", async () => {
    const winner = await createCharacter("auction-winner");
    await setBalance(winner, 100_000);
    await setEligible(winner);
    const goldBefore = await globalGoldTotal();
    const opened = new Date(Date.now() - 2 * DAY_MS);

    const bid = await store.placeBid({
      houseId: 82,
      characterId: winner,
      amount: 20_000,
      minimumBid: 20_000,
      minIncrement: 1_000,
      endsAtMs: opened.getTime() + DAY_MS,
      now: opened,
    });
    expect(bid.status).toBe("bid");

    const now = new Date();
    expect(await store.listDueAuctionIds(now, 10)).toEqual([82]);
    const first = await store.closeAuction({
      houseId: 82,
      now,
      paidUntilMs: now.getTime() + PERIOD_MS,
      buyLevel: 100,
    });
    expect(first.status).toBe("sold");
    // Replay: the auction row is the lease and it is already gone.
    const replay = await store.closeAuction({
      houseId: 82,
      now,
      paidUntilMs: now.getTime() + PERIOD_MS,
      buyLevel: 100,
    });
    expect(replay).toEqual({ status: "skip" });

    expect((await houseRow(82))?.owner_character_id).toBe(winner);
    // The escrow paid for the house: no refund, no second debit.
    expect(await globalGoldTotal()).toBe(goldBefore - 20_000);
    expect(await ledgerCount("house-bid-refund")).toBe(0);
    expect(await auditCount("house-auction-settled")).toBe(1);
    expect(await store.listDueAuctionIds(now, 10)).toEqual([]);
  });

  it("refunds the winner in full when eligibility lapsed before the close", async () => {
    const winner = await createCharacter("auction-lapsed");
    await setBalance(winner, 100_000);
    await setEligible(winner);
    const goldBefore = await globalGoldTotal();
    const opened = new Date(Date.now() - 2 * DAY_MS);

    await store.placeBid({
      houseId: 83,
      characterId: winner,
      amount: 20_000,
      minimumBid: 20_000,
      minIncrement: 1_000,
      endsAtMs: opened.getTime() + DAY_MS,
      now: opened,
    });
    // Premium lapses between the bid and the close.
    await pool.query(
      `UPDATE accounts SET premium_until = now() - interval '1 day'
       WHERE id = (SELECT account_id FROM characters WHERE id = $1)`,
      [winner],
    );

    const now = new Date();
    const closed = await store.closeAuction({
      houseId: 83,
      now,
      paidUntilMs: now.getTime() + PERIOD_MS,
      buyLevel: 100,
    });
    expect(closed).toMatchObject({
      status: "refunded",
      reason: "premium-required",
    });
    expect(await houseRow(83)).toBeNull();
    expect(await auctionRow(83)).toBeNull();
    // Every escrowed coin came back.
    expect(await globalGoldTotal()).toBe(goldBefore);
    expect(await balanceOf(winner)).toBe(100_000);
  });
});
