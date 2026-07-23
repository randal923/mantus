import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { CharacterService } from "../character/CharacterService";
import { PgCharacterStore } from "../character/PgCharacterStore";
import { PgGuildStore } from "./PgGuildStore";

const TEST_SCHEMA = "guild_store_integration";
const MIGRATION_LOCK_KEY = 7_281_017;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgGuildStore;
let characterService: CharacterService;
let characterStore: PgCharacterStore;

const createCharacter = async (label: string): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language)
     VALUES ($1, 'en')
     RETURNING id`,
    [`guild-integration-${label}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("account insert returned no id");
  await characterService.create(accountId, {
    displayName: `Guilder ${label}`,
    vocation: "Knight",
    lookType: 128,
  });
  const summaries = await characterStore.listByAccountId(accountId);
  const summary = summaries[summaries.length - 1];
  if (!summary) throw new Error("character was not created");
  return summary.id;
};

const guildRows = async () => {
  const result = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM guilds ORDER BY created_at",
  );
  return result.rows;
};

const membershipOf = async (characterId: string): Promise<string | null> => {
  const result = await pool.query<{ guild_id: string }>(
    "SELECT guild_id FROM guild_members WHERE character_id = $1",
    [characterId],
  );
  return result.rows[0]?.guild_id ?? null;
};

const warRows = async () => {
  const result = await pool.query<{
    id: string;
    status: number;
    winner_guild_id: string | null;
  }>("SELECT id, status, winner_guild_id FROM guild_wars ORDER BY started_at");
  return result.rows;
};

const warKillCount = async (): Promise<number> => {
  const result = await pool.query<{ total: string }>(
    "SELECT count(*) AS total FROM guild_war_kills",
  );
  return Number(result.rows[0]?.total ?? 0);
};

databaseDescribe("PgGuildStore integration", () => {
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
    store = new PgGuildStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM guild_war_kills");
    await pool.query("DELETE FROM guild_wars");
    await pool.query("DELETE FROM guild_invites");
    await pool.query("DELETE FROM guild_members");
    await pool.query("DELETE FROM guild_ranks");
    await pool.query("DELETE FROM guilds");
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

  it("resolves concurrent creates with the same normalized name to one guild", async () => {
    const [alice, bob] = await Promise.all([
      createCharacter("alice"),
      createCharacter("bob"),
    ]);
    const results = await Promise.all([
      store.createGuild({ ownerCharacterId: alice, name: "Red Rose" }),
      store.createGuild({ ownerCharacterId: bob, name: "RED rose" }),
    ]);
    const created = results.filter((result) => result.status === "created");
    expect(created).toHaveLength(1);
    const failed = results.find((result) => result.status === "failed");
    expect(failed && failed.reason).toBe("name-taken");
    expect(await guildRows()).toHaveLength(1);
  });

  it("resolves concurrent invite acceptances to exactly one membership", async () => {
    const [alice, bob, carol] = await Promise.all([
      createCharacter("alice"),
      createCharacter("bob"),
      createCharacter("carol"),
    ]);
    const one = await store.createGuild({
      ownerCharacterId: alice,
      name: "First Banner",
    });
    const two = await store.createGuild({
      ownerCharacterId: bob,
      name: "Second Banner",
    });
    if (one.status !== "created" || two.status !== "created") {
      throw new Error("guild setup failed");
    }
    await store.createInvite({
      actorCharacterId: alice,
      targetName: "Guilder carol",
    });
    await store.createInvite({
      actorCharacterId: bob,
      targetName: "Guilder carol",
    });
    const results = await Promise.all([
      store.respondInvite({
        characterId: carol,
        guildId: one.guildId,
        accept: true,
      }),
      store.respondInvite({
        characterId: carol,
        guildId: two.guildId,
        accept: true,
      }),
    ]);
    const joined = results.filter((result) => result.status === "joined");
    expect(joined).toHaveLength(1);
    expect(await membershipOf(carol)).not.toBeNull();
    const memberships = await pool.query(
      "SELECT guild_id FROM guild_members WHERE character_id = $1",
      [carol],
    );
    expect(memberships.rows).toHaveLength(1);
    // Joining voided every remaining invite for the character.
    const invites = await pool.query(
      "SELECT * FROM guild_invites WHERE character_id = $1",
      [carol],
    );
    expect(invites.rows).toHaveLength(0);
  });

  it("re-checks a demoted vice's permissions inside the transaction", async () => {
    const [alice, bob, carol, dave] = await Promise.all([
      createCharacter("alice"),
      createCharacter("bob"),
      createCharacter("carol"),
      createCharacter("dave"),
    ]);
    const created = await store.createGuild({
      ownerCharacterId: alice,
      name: "Iron Pact",
    });
    if (created.status !== "created") throw new Error("setup failed");
    for (const member of [bob, carol]) {
      await store.createInvite({
        actorCharacterId: alice,
        targetName:
          member === bob ? "Guilder bob" : "Guilder carol",
      });
      await store.respondInvite({
        characterId: member,
        guildId: created.guildId,
        accept: true,
      });
    }
    await store.promoteMember({ actorCharacterId: alice, targetCharacterId: bob });
    await store.demoteMember({ actorCharacterId: alice, targetCharacterId: bob });

    const kick = await store.kickMember({
      actorCharacterId: bob,
      targetCharacterId: carol,
    });
    expect(kick.status).toBe("failed");
    const invite = await store.createInvite({
      actorCharacterId: bob,
      targetName: "Guilder dave",
    });
    expect(invite.status === "failed" && invite.reason).toBe("not-authorized");
    expect(await membershipOf(carol)).toBe(created.guildId);
    expect(await membershipOf(dave)).toBeNull();
  });

  it("keeps the leader from leaving and swaps ranks on pass-leadership", async () => {
    const [alice, bob] = await Promise.all([
      createCharacter("alice"),
      createCharacter("bob"),
    ]);
    const created = await store.createGuild({
      ownerCharacterId: alice,
      name: "Iron Pact",
    });
    if (created.status !== "created") throw new Error("setup failed");
    await store.createInvite({
      actorCharacterId: alice,
      targetName: "Guilder bob",
    });
    await store.respondInvite({
      characterId: bob,
      guildId: created.guildId,
      accept: true,
    });
    const left = await store.leaveGuild({ characterId: alice });
    expect(left.status === "failed" && left.reason).toBe("leader-cannot-leave");
    const passed = await store.passLeadership({
      actorCharacterId: alice,
      targetCharacterId: bob,
    });
    expect(passed.status).toBe("ok");
    const snapshot = await store.loadSnapshot(created.guildId);
    expect(snapshot?.ownerCharacterId).toBe(bob);
    expect(
      snapshot?.members.find((member) => member.characterId === bob)?.rankLevel,
    ).toBe(3);
    expect(
      snapshot?.members.find((member) => member.characterId === alice)
        ?.rankLevel,
    ).toBe(2);
    expect((await store.leaveGuild({ characterId: alice })).status).toBe("ok");
  });

  it("allows one open war per pair and ends a raced frag limit exactly once", async () => {
    const [alice, bob] = await Promise.all([
      createCharacter("alice"),
      createCharacter("bob"),
    ]);
    const one = await store.createGuild({
      ownerCharacterId: alice,
      name: "Iron Pact",
    });
    const two = await store.createGuild({
      ownerCharacterId: bob,
      name: "Red Rose",
    });
    if (one.status !== "created" || two.status !== "created") {
      throw new Error("setup failed");
    }
    const declared = await store.declareWar({
      actorCharacterId: alice,
      targetGuildName: "Red Rose",
      fragLimit: 1,
    });
    if (declared.status !== "declared") throw new Error("declare failed");
    const duplicate = await store.declareWar({
      actorCharacterId: alice,
      targetGuildName: "red rose",
      fragLimit: 10,
    });
    expect(duplicate.status === "failed" && duplicate.reason).toBe(
      "war-already-active",
    );
    const accepted = await store.respondWar({
      actorCharacterId: bob,
      warId: declared.warId,
      accept: true,
    });
    expect(accepted.status).toBe("war-active");

    // Two limit-reaching kills race; the war row lock lets exactly one
    // transaction observe the limit and perform the single end transition.
    const kills = await Promise.all([
      store.recordWarKill({
        killerCharacterId: alice,
        targetCharacterId: bob,
        killerGuildId: one.guildId,
        targetGuildId: two.guildId,
      }),
      store.recordWarKill({
        killerCharacterId: alice,
        targetCharacterId: bob,
        killerGuildId: one.guildId,
        targetGuildId: two.guildId,
      }),
    ]);
    const ended = kills.filter((kill) => kill.status === "war-ended");
    expect(ended).toHaveLength(1);
    expect(kills.filter((kill) => kill.status === "no-war")).toHaveLength(1);
    const wars = await warRows();
    expect(wars).toHaveLength(1);
    expect(wars[0]?.status).toBe(4);
    expect(wars[0]?.winner_guild_id).toBe(one.guildId);
    expect(await warKillCount()).toBe(1);
  });

  it("expires stale pending wars and cascades cleanly on disband", async () => {
    const [alice, bob] = await Promise.all([
      createCharacter("alice"),
      createCharacter("bob"),
    ]);
    const one = await store.createGuild({
      ownerCharacterId: alice,
      name: "Iron Pact",
    });
    const two = await store.createGuild({
      ownerCharacterId: bob,
      name: "Red Rose",
    });
    if (one.status !== "created" || two.status !== "created") {
      throw new Error("setup failed");
    }
    const declared = await store.declareWar({
      actorCharacterId: alice,
      targetGuildName: "Red Rose",
      fragLimit: 10,
    });
    if (declared.status !== "declared") throw new Error("declare failed");
    const expired = await store.expirePendingWars(
      new Date(Date.now() + 60_000),
    );
    expect(expired.map((war) => war.warId)).toEqual([declared.warId]);
    expect((await warRows())[0]?.status).toBe(2);

    const disbanded = await store.disbandGuild({ actorCharacterId: alice });
    expect(disbanded.status).toBe("ok");
    expect(await guildRows()).toHaveLength(1);
    expect(await membershipOf(alice)).toBeNull();
    const ranks = await pool.query(
      "SELECT * FROM guild_ranks WHERE guild_id = $1",
      [one.guildId],
    );
    expect(ranks.rows).toHaveLength(0);
    expect(await warRows()).toHaveLength(0);
  });
});
