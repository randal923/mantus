import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import type { BestiaryCatalog } from "./BestiaryCatalog";
import { BestiaryService } from "./BestiaryService";
import { BestiaryTracker } from "./BestiaryTracker";
import { getBestiaryStage } from "./getBestiaryStage";
import { getBossMilestones } from "./getBossMilestones";
import { getLootRarity } from "./getLootRarity";
import { MemoryBestiaryStore } from "./MemoryBestiaryStore";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

function makeMonsterType(overrides: Partial<MonsterType>): MonsterType {
  return {
    id: "rat",
    name: "Rat",
    description: "a rat",
    outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    health: 20,
    maxHealth: 20,
    speed: 67,
    manaCost: 0,
    changeTarget: { intervalMs: 4_000, chance: 0 },
    light: { intensity: 0, color: 0 },
    experience: 5,
    corpseItemTypeId: 5964,
    flags: {
      attackable: true,
      hostile: true,
      pushable: true,
      summonable: false,
      convinceable: false,
      illusionable: false,
      canPushItems: false,
      canPushCreatures: false,
      targetDistance: 1,
      runHealth: 5,
      staticAttackChance: 95,
      healthHidden: false,
    },
    targetStrategy: { nearest: 100, health: 0, damage: 0, random: 0 },
    attacks: [],
    defenses: [{ kind: "stats", intervalMs: 2_000, chance: 100, target: "self", range: 0, area: { shape: "single" }, defense: 5, armor: 1, mitigation: 0.07 }],
    elements: { earth: 20, ice: -10 },
    immunities: [],
    summons: [],
    voices: [],
    loot: [
      { itemName: "gold coin", chance: 100_000, maxCount: 4 },
      { itemTypeId: 3607, chance: 150, maxCount: 1 },
    ],
    ...overrides,
  };
}

const ratType = makeMonsterType({});
const bossType = makeMonsterType({ id: "black-knight", name: "Black Knight" });
const butterflyType = makeMonsterType({ id: "butterfly", name: "Butterfly" });
const pinkButterflyType = makeMonsterType({
  id: "pink-butterfly",
  name: "Pink Butterfly",
});

function makeCatalog(): BestiaryCatalog {
  const ratEntry = {
    raceId: 21,
    className: "Mammal" as const,
    stars: 1,
    occurrence: 0,
    charmPoints: 5,
    firstUnlock: 10,
    secondUnlock: 100,
    toKill: 250,
    locations: "Sewers near towns.",
    monsterType: ratType,
  };
  const butterflyEntry = {
    ...ratEntry,
    raceId: 213,
    charmPoints: 10,
    monsterType: butterflyType,
  };
  return {
    entriesByRaceId: new Map([
      [21, ratEntry],
      [213, butterflyEntry],
    ]),
    bossesByRaceId: new Map([
      [46, { raceId: 46, category: "bane" as const, monsterType: bossType }],
    ]),
    raceIdByMonsterTypeId: new Map([
      ["rat", 21],
      ["butterfly", 213],
      ["pink-butterfly", 213],
      ["black-knight", 46],
    ]),
  };
}

interface Harness {
  readonly world: World;
  readonly tracker: BestiaryTracker;
  readonly service: BestiaryService;
  readonly store: MemoryBestiaryStore;
  readonly session: Session;
  readonly sent: ServerMessage[];
}

function makeHarness(): Harness {
  const world = new World(
    gridMapData({
      name: "bestiary-test",
      width: 60,
      height: 60,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const player = new Player(makeCharacter(A, "Alice"), { x: 30, y: 30, z: 7 }, 0);
  world.addPlayer(player);
  const sent: ServerMessage[] = [];
  const session = {
    id: "session-a",
    playerId: A,
    send: (message: ServerMessage) => sent.push(message),
    sendError: (code: string) => sent.push({ type: "error", code } as ServerMessage),
  } as unknown as Session;
  const registry = {
    sessionFor: (characterId: string) =>
      characterId === A ? session : undefined,
  } as unknown as SessionRegistry;
  const items = {
    itemType: (id: number) => ({ id, spriteId: id + 1_000, name: `item ${id}` }),
    itemTypeByName: (name: string) =>
      name === "gold coin"
        ? { id: 3_031, spriteId: 4_031, name }
        : undefined,
  } as unknown as ItemIntentHandler;
  const store = new MemoryBestiaryStore();
  const catalog = makeCatalog();
  const tracker = new BestiaryTracker(catalog, registry, store);
  tracker.attach(A, new Map());
  const service = new BestiaryService(world, catalog, tracker, items);
  return { world, tracker, service, store, session, sent };
}

function makeMonster(type: MonsterType): Monster {
  return new Monster({
    id: `monster:${type.id}`,
    type,
    position: { x: 31, y: 30, z: 7 },
    direction: "south",
    home: { x: 31, y: 30, z: 7 },
    spawnRadius: 3,
  });
}

function kill(harness: Harness, type: MonsterType, times: number): void {
  for (let index = 0; index < times; index++) {
    harness.tracker.onMonsterKilled([A], makeMonster(type), 0);
  }
}

describe("stage and rarity math", () => {
  it("maps kill counts to Canary's four unlock stages", () => {
    const entry = { firstUnlock: 10, secondUnlock: 100, toKill: 250 };
    expect(getBestiaryStage(entry, 0)).toBe(0);
    expect(getBestiaryStage(entry, 1)).toBe(1);
    expect(getBestiaryStage(entry, 9)).toBe(1);
    expect(getBestiaryStage(entry, 10)).toBe(2);
    expect(getBestiaryStage(entry, 100)).toBe(3);
    expect(getBestiaryStage(entry, 249)).toBe(3);
    expect(getBestiaryStage(entry, 250)).toBe(4);
  });

  it("buckets drop chances like Canary's difficulty stars", () => {
    expect(getLootRarity(100_000)).toBe(0);
    expect(getLootRarity(25_000)).toBe(0);
    expect(getLootRarity(24_999)).toBe(1);
    expect(getLootRarity(4_999)).toBe(2);
    expect(getLootRarity(999)).toBe(3);
    expect(getLootRarity(150)).toBe(4);
  });

  it("awards boss milestones per category", () => {
    expect(getBossMilestones("bane", 24)).toEqual({ reached: 0, points: 0 });
    expect(getBossMilestones("bane", 25)).toEqual({ reached: 1, points: 5 });
    expect(getBossMilestones("bane", 300)).toEqual({ reached: 3, points: 50 });
    expect(getBossMilestones("nemesis", 1)).toEqual({ reached: 1, points: 10 });
    expect(getBossMilestones("nemesis", 5)).toEqual({ reached: 3, points: 100 });
  });
});

describe("BestiaryTracker", () => {
  it("credits each attached damager once per death", () => {
    const harness = makeHarness();
    harness.tracker.onMonsterKilled([A, A, B], makeMonster(ratType), 0);
    expect(harness.tracker.killsFor(A).get(21)).toBe(1);
    // B is not online/attached, so no counter exists for it.
    expect(harness.tracker.killsFor(B).get(21)).toBeUndefined();
  });

  it("merges kills of outfit variants sharing one race id", () => {
    const harness = makeHarness();
    kill(harness, butterflyType, 1);
    kill(harness, pinkButterflyType, 1);
    expect(harness.tracker.killsFor(A).get(213)).toBe(2);
  });

  it("pushes an entry-changed message on every kill with the current stage", () => {
    const harness = makeHarness();
    kill(harness, ratType, 9);
    const changes = harness.sent.filter(
      (message) => message.type === "bestiary-entry-changed",
    );
    // Every kill is pushed so the client-side cache stays fresh.
    expect(changes).toHaveLength(9);
    expect(changes.at(0)).toMatchObject({ kills: 1, stage: 1 });
    expect(changes.at(-1)).toMatchObject({ kills: 9, stage: 1 });
    kill(harness, ratType, 1);
    expect(
      harness.sent.filter((m) => m.type === "bestiary-entry-changed").at(-1),
    ).toMatchObject({ scope: "bestiary", raceId: 21, kills: 10, stage: 2 });
  });

  it("announces boss kills with the milestone count as stage", () => {
    const harness = makeHarness();
    kill(harness, bossType, 1);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "bestiary-entry-changed",
      scope: "bosstiary",
      raceId: 46,
      kills: 1,
      stage: 0,
    });
    kill(harness, bossType, 24);
    expect(harness.sent.at(-1)).toMatchObject({
      scope: "bosstiary",
      kills: 25,
      stage: 1,
    });
  });

  it("persists increments and reloads them on attach", async () => {
    const harness = makeHarness();
    kill(harness, ratType, 3);
    await harness.tracker.stop();
    const reloaded = await harness.store.loadKills(A);
    expect(reloaded.get(21)).toBe(3);
    harness.tracker.detachCharacter(A);
    harness.tracker.attach(A, reloaded);
    expect(harness.tracker.killsFor(A).get(21)).toBe(3);
  });
});

describe("BestiaryService", () => {
  it("lists the whole bestiary with per-entry class and charm point total", () => {
    const harness = makeHarness();
    kill(harness, ratType, 250);
    harness.service.handleCreatures(harness.session, 1_000);
    const state = harness.sent.at(-1);
    expect(state).toMatchObject({ type: "bestiary-creatures-state" });
    if (state?.type !== "bestiary-creatures-state") throw new Error("missing");
    expect(state.entries).toHaveLength(2);
    expect(state.charmPoints).toBe(5);
    const butterfly = state.entries.find((entry) => entry.raceId === 213);
    expect(butterfly).toMatchObject({
      className: "Mammal",
      stage: 0,
      kills: 0,
    });
    const rat = state.entries.find((entry) => entry.raceId === 21);
    expect(rat).toMatchObject({ className: "Mammal", stage: 4, kills: 250 });
  });

  it("serves the public detail sheet before charm progress begins", () => {
    const harness = makeHarness();
    harness.service.handleMonster(
      harness.session,
      { type: "bestiary-monster-get", raceId: 21 },
      1_000,
    );
    expect(harness.sent.at(-1)).toMatchObject({
      type: "bestiary-monster-state",
      raceId: 21,
      stage: 0,
      kills: 0,
      locations: "Sewers near towns.",
      stats: { maxHealth: 20, experience: 5 },
      loot: [
        { itemTypeId: 3_031, spriteId: 4_031 },
        { itemTypeId: 3_607, spriteId: 4_607 },
      ],
    });
  });

  it("rejects unknown race ids", () => {
    const harness = makeHarness();
    harness.service.handleMonster(
      harness.session,
      { type: "bestiary-monster-get", raceId: 9_999 },
      1_000,
    );
    expect(harness.sent.at(-1)).toEqual({
      type: "bestiary-action-failed",
      reason: "unknown-race",
    });
  });

  it("keeps full catalog details visible while completion progresses", () => {
    const harness = makeHarness();
    kill(harness, ratType, 1);
    harness.service.handleMonster(
      harness.session,
      { type: "bestiary-monster-get", raceId: 21 },
      1_000,
    );
    const state = harness.sent.at(-1);
    if (state?.type !== "bestiary-monster-state") throw new Error("missing");
    expect(state.stage).toBe(1);
    expect(state.stats.maxHealth).toBe(20);
    expect(state.resistances).toContainEqual({ element: "earth", percent: 80 });
    expect(state.locations).toBe("Sewers near towns.");
    expect(state.loot).toHaveLength(2);
    for (const entry of state.loot) {
      expect(entry.itemTypeId).toBeGreaterThan(0);
      expect(entry.spriteId).toBeGreaterThan(0);
      expect(entry.name).toBeTruthy();
    }
  });

  it("reveals the full sheet at stage 4", () => {
    const harness = makeHarness();
    kill(harness, ratType, 250);
    harness.service.handleMonster(
      harness.session,
      { type: "bestiary-monster-get", raceId: 21 },
      1_000,
    );
    const state = harness.sent.at(-1);
    if (state?.type !== "bestiary-monster-state") throw new Error("missing");
    expect(state.stage).toBe(4);
    expect(state.stats).toEqual({
      maxHealth: 20,
      experience: 5,
      speed: 67,
      armor: 1,
      mitigation: 0.07,
    });
    expect(state.locations).toBe("Sewers near towns.");
    expect(state.resistances).toContainEqual({ element: "earth", percent: 80 });
    expect(state.resistances).toContainEqual({ element: "ice", percent: 110 });
    expect(state.resistances).toContainEqual({
      element: "physical",
      percent: 100,
    });
    const common = state.loot.find((entry) => entry.itemTypeId === 3_031);
    expect(common).toMatchObject({ spriteId: 4_031, rarity: 0 });
    const rare = state.loot.find((entry) => entry.itemTypeId === 3_607);
    expect(rare).toMatchObject({ spriteId: 4_607, rarity: 4 });
  });

  it("serves the bosstiary with derived boss points", () => {
    const harness = makeHarness();
    kill(harness, bossType, 25);
    harness.service.handleBosstiary(harness.session, 1_000);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "bosstiary-state",
      bossPoints: 5,
      entries: [
        { raceId: 46, name: "Black Knight", category: "bane", kills: 25 },
      ],
    });
  });

  it("serves public boss stats and loot before boss progress begins", () => {
    const harness = makeHarness();
    harness.service.handleBoss(
      harness.session,
      { type: "bosstiary-boss-get", raceId: 46 },
      1_000,
    );
    expect(harness.sent.at(-1)).toMatchObject({
      type: "bosstiary-boss-state",
      raceId: 46,
      name: "Black Knight",
      category: "bane",
      kills: 0,
      stats: { maxHealth: 20, armor: 1 },
      loot: [
        { itemTypeId: 3_031, spriteId: 4_031 },
        { itemTypeId: 3_607, spriteId: 4_607 },
      ],
    });
  });

  it("lists public bestiary and bosstiary sources for an item", () => {
    const harness = makeHarness();
    harness.service.handleItemSources(
      harness.session,
      { type: "wiki-item-sources-get", itemTypeId: 3_031 },
      1_000,
    );
    expect(harness.sent.at(-1)).toMatchObject({
      type: "wiki-item-sources-state",
      itemTypeId: 3_031,
      sources: [
        { scope: "bosstiary", raceId: 46, name: "Black Knight" },
        { scope: "bestiary", raceId: 213, name: "Butterfly" },
        { scope: "bestiary", raceId: 21, name: "Rat" },
      ],
    });
  });

  it("rate limits back-to-back requests per session", () => {
    const harness = makeHarness();
    harness.service.handleCreatures(harness.session, 1_000);
    harness.service.handleCreatures(harness.session, 1_100);
    expect(harness.sent.at(-1)).toEqual({
      type: "bestiary-action-failed",
      reason: "rate-limited",
    });
    harness.service.handleCreatures(harness.session, 1_400);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "bestiary-creatures-state",
    });
  });

  it("requires a joined player", () => {
    const harness = makeHarness();
    const stray = {
      id: "session-b",
      playerId: null,
      send: (message: ServerMessage) => harness.sent.push(message),
      sendError: (code: string) =>
        harness.sent.push({ type: "error", code } as ServerMessage),
    } as unknown as Session;
    harness.service.handleCreatures(stray, 1_000);
    expect(harness.sent.at(-1)).toMatchObject({ type: "error" });
  });
});
