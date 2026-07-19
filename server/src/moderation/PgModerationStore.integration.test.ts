import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { PgModerationStore } from "./PgModerationStore";

const TEST_SCHEMA = "moderation_store_integration";
const MIGRATION_LOCK_KEY = 7_281_021;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgModerationStore;

const insertAccount = async (label: string): Promise<string> => {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`moderation-${label}`],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("account insert returned no id");
  return id;
};

const insertCharacter = async (
  accountId: string,
  name: string,
): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO characters (
       id, account_id, display_name, normalized_name, vocation,
       health, mana, position_x, position_y, position_z, direction,
       outfit_look_type, outfit_head, outfit_body, outfit_legs, outfit_feet,
       town_id
     ) VALUES (
       $1, $2, $3, $4, 'Knight',
       150, 50, 100, 100, 7, 'south',
       128, 1, 1, 1, 1, 1
     )`,
    [id, accountId, name, name.toLowerCase()],
  );
  return id;
};

const actionRows = async () => {
  const result = await pool.query<{
    action: string;
    target_character_id: string | null;
    issued_by_character_id: string | null;
    reason: string;
  }>(
    `SELECT action, target_character_id, issued_by_character_id, reason
     FROM moderation_actions ORDER BY created_at`,
  );
  return result.rows;
};

const bannedUntilOf = async (accountId: string): Promise<Date | null> => {
  const result = await pool.query<{ banned_until: Date | null }>(
    "SELECT banned_until FROM accounts WHERE id = $1",
    [accountId],
  );
  return result.rows[0]?.banned_until ?? null;
};

const reportCount = async (): Promise<number> => {
  const result = await pool.query<{ total: string }>(
    "SELECT count(*) AS total FROM player_reports",
  );
  return Number(result.rows[0]?.total ?? 0);
};

databaseDescribe("PgModerationStore integration", () => {
  let gmId: string;
  let victimId: string;
  let victimAccountId: string;

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
    store = new PgModerationStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM player_reports");
    await pool.query("DELETE FROM moderation_actions");
    await pool.query("DELETE FROM character_mutes");
    await pool.query("DELETE FROM account_bans");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    const gmAccountId = await insertAccount("gm");
    victimAccountId = await insertAccount("victim");
    gmId = await insertCharacter(gmAccountId, "Gamemaster");
    victimId = await insertCharacter(victimAccountId, "Victim");
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool?.end();
    await setupClient?.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient?.end();
  });

  it("writes the mute and its audit row in the same transaction", async () => {
    const result = await store.muteCharacter({
      actorCharacterId: gmId,
      targetName: "victim",
      durationMs: 300_000,
      reason: "spam",
    });
    expect(result.status).toBe("muted");
    const mute = await store.loadMute(victimId);
    expect(mute?.reason).toBe("spam");
    expect(mute?.mutedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(await actionRows()).toEqual([
      {
        action: "mute",
        target_character_id: victimId,
        issued_by_character_id: gmId,
        reason: "spam",
      },
    ]);

    const unmuted = await store.unmuteCharacter({
      actorCharacterId: gmId,
      targetName: "Victim",
    });
    expect(unmuted.status).toBe("unmuted");
    expect(await store.loadMute(victimId)).toBeNull();

    // A no-op unmute is rejected and leaves no audit row behind.
    const again = await store.unmuteCharacter({
      actorCharacterId: gmId,
      targetName: "Victim",
    });
    expect(again).toEqual({ status: "failed", reason: "not-muted" });
    expect((await actionRows()).map((row) => row.action)).toEqual([
      "mute",
      "unmute",
    ]);
  });

  it("leaves no rows at all when the target does not resolve", async () => {
    const result = await store.muteCharacter({
      actorCharacterId: gmId,
      targetName: "Nobody",
      durationMs: 300_000,
      reason: "spam",
    });
    expect(result).toEqual({ status: "failed", reason: "target-not-found" });
    expect(await actionRows()).toHaveLength(0);
    const mutes = await pool.query("SELECT * FROM character_mutes");
    expect(mutes.rows).toHaveLength(0);
  });

  it("bans atomically across accounts.banned_until, account_bans, and the trail", async () => {
    const result = await store.banAccount({
      actorCharacterId: gmId,
      targetName: "Victim",
      durationMs: 24 * 3600 * 1000,
      reason: "rmt",
    });
    if (result.status !== "banned") throw new Error("ban failed");
    expect(result.accountId).toBe(victimAccountId);
    const bannedUntil = await bannedUntilOf(victimAccountId);
    expect(bannedUntil?.getTime()).toBe(result.expiresAt.getTime());
    const bans = await pool.query(
      "SELECT reason, banned_by_character_id FROM account_bans WHERE account_id = $1",
      [victimAccountId],
    );
    expect(bans.rows).toEqual([
      { reason: "rmt", banned_by_character_id: gmId },
    ]);

    const unbanned = await store.unbanAccount({
      actorCharacterId: gmId,
      targetName: "Victim",
    });
    expect(unbanned.status).toBe("unbanned");
    expect(await bannedUntilOf(victimAccountId)).toBeNull();
    expect(
      (await pool.query("SELECT * FROM account_bans")).rows,
    ).toHaveLength(0);
    expect((await actionRows()).map((row) => row.action)).toEqual([
      "ban",
      "unban",
    ]);

    const notBanned = await store.unbanAccount({
      actorCharacterId: gmId,
      targetName: "Victim",
    });
    expect(notBanned).toEqual({ status: "failed", reason: "not-banned" });
  });

  it("records kicks and notes in the trail", async () => {
    const kick = await store.recordKick({
      actorCharacterId: gmId,
      targetName: "Victim",
      reason: "",
    });
    expect(kick.status).toBe("recorded");
    const note = await store.recordNote({
      actorCharacterId: gmId,
      targetName: "Victim",
      text: "repeat offender",
    });
    expect(note.status).toBe("recorded");
    expect(await actionRows()).toEqual([
      {
        action: "kick",
        target_character_id: victimId,
        issued_by_character_id: gmId,
        reason: "",
      },
      {
        action: "note",
        target_character_id: victimId,
        issued_by_character_id: gmId,
        reason: "repeat offender",
      },
    ]);
  });

  it("enforces the daily report cap inside the transaction, even racing", async () => {
    for (let index = 0; index < 19; index += 1) {
      const created = await store.createReport({
        reporterCharacterId: gmId,
        targetName: "Victim",
        reason: "abuse",
        comment: `report ${index}`,
        maxPerDay: 20,
      });
      expect(created.status).toBe("created");
    }
    // Two racing reports at 19/20: the cap admits exactly one more.
    const raced = await Promise.all([
      store.createReport({
        reporterCharacterId: gmId,
        targetName: "Victim",
        reason: "abuse",
        comment: "race a",
        maxPerDay: 20,
      }),
      store.createReport({
        reporterCharacterId: gmId,
        targetName: "Victim",
        reason: "abuse",
        comment: "race b",
        maxPerDay: 20,
      }),
    ]);
    expect(
      raced.filter((result) => result.status === "created").length,
    ).toBeLessThanOrEqual(1);
    expect(await reportCount()).toBeLessThanOrEqual(20);

    const overCap = await store.createReport({
      reporterCharacterId: gmId,
      targetName: "Victim",
      reason: "abuse",
      comment: "one too many",
      maxPerDay: 20,
    });
    if ((await reportCount()) >= 20) {
      expect(overCap).toEqual({ status: "failed", reason: "rate-limited" });
    }
    const stored = await pool.query<{
      target_character_id: string;
      target_name: string;
    }>("SELECT target_character_id, target_name FROM player_reports LIMIT 1");
    expect(stored.rows[0]).toEqual({
      target_character_id: victimId,
      target_name: "Victim",
    });
  });
});
