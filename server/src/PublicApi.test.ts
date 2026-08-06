import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryCyclopediaStore } from "./cyclopedia/MemoryCyclopediaStore";
import { MemoryGuildStore } from "./guild/MemoryGuildStore";
import { MemoryProfileStore } from "./profile/MemoryProfileStore";
import { MemoryHighscoreStore } from "./social/MemoryHighscoreStore";
import { PublicApi } from "./PublicApi";

const SERVER_INFO = {
  maxPlayers: 500,
  pvpType: "open-pvp" as const,
  rates: {
    experience: 2,
    skill: 2,
    magic: 2,
    loot: 1,
    spawn: 1,
    soulRegen: 1,
    offlineTraining: 1,
    exerciseTraining: 1,
    bestiaryKills: 1,
    bosstiaryKills: 1,
  },
  stages: {
    experience: [
      { minLevel: 1, maxLevel: 8, multiplier: 50 },
      { minLevel: 9, maxLevel: null, multiplier: 2 },
    ],
    skill: [],
    magic: [],
  },
  systems: {
    stamina: true,
    experienceStages: true,
    market: true,
    houses: true,
    guildWars: true,
    dailyRewards: true,
  },
  startedAt: "2026-07-31T12:00:00.000Z",
};

describe("PublicApi", () => {
  let server: Server | undefined;

  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!server?.listening) {
          resolve();
          return;
        }
        server.close((cause) => {
          if (cause) reject(cause);
          else resolve();
        });
      }),
  );

  it("serves a bounded public projection and shares one cached read", async () => {
    const store = new MemoryHighscoreStore([
      {
        name: "Aster",
        level: 90,
        vocation: "Knight",
        experience: 9_000_000,
        magicLevel: 8,
        skills: {},
      },
      {
        name: "Briar",
        level: 80,
        vocation: "Druid",
        experience: 8_000_000,
        magicLevel: 70,
        skills: {},
      },
    ]);
    const api = new PublicApi({
      worldName: "Mantus",
      onlinePlayers: () => [
        {
          name: "Aster",
          level: 90,
          vocation: "Knight",
          guildName: null,
        },
        {
          name: "Briar",
          level: 80,
          vocation: "Druid",
          guildName: "Wardens",
        },
      ],
      isOnline: (characterId) => characterId === "aster-id",
      residenceFor: () => "Thais",
      boosted: () => ({
        creature: { raceId: 10, name: "Dragon", lookTypeId: 34 },
        boss: null,
      }),
      highscores: store,
      serverInfo: SERVER_INFO,
    });
    server = createServer((request, response) => {
      void api.handle(request, response);
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("test HTTP server has no TCP address");
    }

    const url = `http://127.0.0.1:${address.port}/api/public/landing`;
    const first = await fetch(url);
    const second = await fetch(url);

    expect(first.status).toBe(200);
    expect(first.headers.get("access-control-allow-origin")).toBe("*");
    expect(await first.json()).toMatchObject({
      status: "online",
      worldName: "Mantus",
      playersOnline: 2,
      boosted: {
        creature: { raceId: 10, name: "Dragon", lookTypeId: 34 },
        boss: null,
      },
      highscores: [
        {
          rank: 1,
          name: "Aster",
          level: 90,
          vocation: "Knight",
          value: "9000000",
        },
        {
          rank: 2,
          name: "Briar",
          level: 80,
          vocation: "Druid",
          value: "8000000",
        },
      ],
    });
    expect(second.status).toBe(200);
    expect(store.loadCount).toBe(1);
  });

  it("serves paged highscores, online players, characters, and server info", async () => {
    const highscores = new MemoryHighscoreStore([
      {
        name: "Aster",
        level: 90,
        vocation: "Knight",
        experience: 9_000_000,
        magicLevel: 8,
        skills: {},
      },
    ]);
    const profiles = new MemoryProfileStore();
    profiles.registerCharacter("aster-id", "Aster", 90, "Knight", "female");
    await profiles.grantAchievement({
      characterId: "aster-id",
      achievementId: "first-steps",
    });
    const cyclopedia = new MemoryCyclopediaStore();
    await cyclopedia.recordDeath(
      "aster-id",
      89,
      "Died at level 89 by a dragon.",
    );
    const api = new PublicApi({
      worldName: "Mantus",
      onlinePlayers: () => [
        {
          name: "Aster",
          level: 90,
          vocation: "Knight",
          guildName: null,
        },
      ],
      isOnline: (characterId) => characterId === "aster-id",
      residenceFor: () => "Thais",
      boosted: () => ({ creature: null, boss: null }),
      highscores,
      profiles,
      cyclopedia,
      serverInfo: SERVER_INFO,
    });
    server = createServer((request, response) => {
      void api.handle(request, response);
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("test HTTP server has no TCP address");
    }
    const origin = `http://127.0.0.1:${address.port}`;

    const ranking = await fetch(
      `${origin}/api/public/highscores?category=experience&page=0`,
    );
    expect(ranking.status).toBe(200);
    expect(await ranking.json()).toMatchObject({
      category: "experience",
      vocation: null,
      page: 0,
      totalPages: 1,
      entries: [{ rank: 1, name: "Aster", level: 90 }],
    });

    const online = await fetch(`${origin}/api/public/online`);
    expect(online.status).toBe(200);
    expect(await online.json()).toMatchObject({
      playersOnline: 1,
      players: [{ name: "Aster", level: 90 }],
    });

    const profile = await fetch(`${origin}/api/public/characters/Aster`);
    expect(profile.status).toBe(200);
    expect(await profile.json()).toMatchObject({
      name: "Aster",
      level: 90,
      sex: "female",
      residence: "Thais",
      online: true,
      achievements: [{ achievementId: "first-steps", granted: true }],
      deathHistory: [
        {
          level: 89,
          cause: "Died at level 89 by a dragon.",
        },
      ],
    });

    const serverInfo = await fetch(`${origin}/api/public/server-info`);
    expect(serverInfo.status).toBe(200);
    expect(await serverInfo.json()).toMatchObject({
      worldName: "Mantus",
      playersOnline: 1,
      maxPlayers: 500,
      pvpType: "open-pvp",
      rates: { experience: 2 },
      stages: {
        experience: [
          { minLevel: 1, maxLevel: 8, multiplier: 50 },
          { minLevel: 9, maxLevel: null, multiplier: 2 },
        ],
      },
    });
  });

  it("rejects writes, malformed queries, and unknown routes", async () => {
    const api = new PublicApi({
      worldName: "Mantus",
      onlinePlayers: () => [],
      isOnline: () => false,
      residenceFor: () => undefined,
      boosted: () => ({ creature: null, boss: null }),
      serverInfo: SERVER_INFO,
    });
    server = createServer((request, response) => {
      void api.handle(request, response);
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("test HTTP server has no TCP address");
    }
    const origin = `http://127.0.0.1:${address.port}`;

    expect(
      (await fetch(`${origin}/api/public/landing`, { method: "POST" })).status,
    ).toBe(405);
    expect(
      (
        await fetch(
          `${origin}/api/public/highscores?page=999&category=experience`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(
          `${origin}/api/public/highscores?category=experience&unknown=true`,
        )
      ).status,
    ).toBe(400);
    expect((await fetch(`${origin}/api/private`)).status).toBe(404);
  });

  it("serves the guild directory and public rosters without private fields", async () => {
    const guilds = new MemoryGuildStore();
    guilds.registerCharacter("aster-id", "Aster", {
      vocation: "Knight",
      level: 90,
    });
    guilds.registerCharacter("briar-id", "Briar", {
      vocation: "Druid",
      level: 80,
    });
    const created = await guilds.createGuild({
      ownerCharacterId: "aster-id",
      name: "Wardens",
    });
    if (created.status !== "created") throw new Error("guild not created");
    await guilds.createInvite({
      actorCharacterId: "aster-id",
      targetName: "Briar",
    });
    await guilds.respondInvite({
      characterId: "briar-id",
      guildId: created.guildId,
      accept: true,
    });
    const api = new PublicApi({
      worldName: "Mantus",
      onlinePlayers: () => [],
      isOnline: (characterId) => characterId === "aster-id",
      residenceFor: () => undefined,
      boosted: () => ({ creature: null, boss: null }),
      guilds,
      serverInfo: SERVER_INFO,
    });
    server = createServer((request, response) => {
      void api.handle(request, response);
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("test HTTP server has no TCP address");
    }
    const origin = `http://127.0.0.1:${address.port}`;

    const directory = await fetch(`${origin}/api/public/guilds`);
    expect(directory.status).toBe(200);
    expect(await directory.json()).toMatchObject({
      guilds: [{ name: "Wardens", memberCount: 2, level: 1 }],
    });

    const roster = await fetch(`${origin}/api/public/guilds/wardens`);
    expect(roster.status).toBe(200);
    const rosterBody = await roster.text();
    expect(rosterBody).not.toContain("characterId");
    expect(rosterBody).not.toContain("balance");
    expect(JSON.parse(rosterBody)).toMatchObject({
      name: "Wardens",
      membersOnline: 1,
      members: [
        {
          name: "Aster",
          rankName: "The Leader",
          rankLevel: 3,
          vocation: "Knight",
          level: 90,
          online: true,
        },
        {
          name: "Briar",
          rankName: "Member",
          rankLevel: 1,
          vocation: "Druid",
          level: 80,
          online: false,
        },
      ],
    });

    expect((await fetch(`${origin}/api/public/guilds/Unknown`)).status).toBe(
      404,
    );
  });
});
