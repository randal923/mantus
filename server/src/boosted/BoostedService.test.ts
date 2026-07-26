import { describe, expect, it } from "vitest";
import type {
  BossSlotsStateMessage,
  BoostedStateMessage,
  ServerMessage,
  TrackerStateMessage,
} from "@tibia/protocol";
import { WorldActionRng } from "../action/WorldActionRng";
import type {
  BestiaryCatalog,
  BestiaryCatalogEntry,
  BossCatalogEntry,
} from "../bestiary/BestiaryCatalog";
import { BestiaryTracker } from "../bestiary/BestiaryTracker";
import { BossSlotService } from "../bestiary/BossSlotService";
import { MemoryBossSlotStore } from "../bestiary/MemoryBossSlotStore";
import { MemoryTrackerStore } from "../bestiary/MemoryTrackerStore";
import { TrackerService } from "../bestiary/TrackerService";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { BoostedService } from "./BoostedService";
import { MemoryBoostedStore } from "./MemoryBoostedStore";
import { normalRandomIndex } from "./normalRandomIndex";

const A = "00000000-0000-4000-8000-00000000000a";

const DAY_ONE = new Date("2026-07-26T10:00:00").getTime();
const DAY_TWO = new Date("2026-07-27T10:00:00").getTime();

function makeMonsterType(raceIndex: number, rewardBoss = false): MonsterType {
  return {
    id: `beast-${raceIndex}`,
    name: `Beast ${raceIndex}`,
    description: `beast ${raceIndex}`,
    outfit: { lookType: 100 + raceIndex, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    health: 100,
    maxHealth: 100,
    speed: 80,
    manaCost: 0,
    changeTarget: { intervalMs: 4_000, chance: 0 },
    light: { intensity: 0, color: 0 },
    experience: 50,
    corpseItemTypeId: 5964,
    race: "blood",
    faction: "default",
    enemyFactions: [],
    flags: {
      attackable: true,
      hostile: true,
      pushable: false,
      summonable: false,
      convinceable: false,
      illusionable: false,
      canPushItems: false,
      canPushCreatures: false,
      targetDistance: 1,
      runHealth: 0,
      staticAttackChance: 95,
      healthHidden: false,
      canWalkOnEnergy: false,
      canWalkOnFire: false,
      canWalkOnPoison: false,
      isBlockable: true,
      rewardBoss,
    },
    targetStrategy: { nearest: 100, health: 0, damage: 0, random: 0 },
    attacks: [],
    defenses: [],
    elements: {},
    immunities: [],
    reflects: {},
    heals: {},
    events: [],
    callbacks: [],
    maxSummons: 0,
    summons: [],
    voices: [],
    loot: [],
  };
}

function makeCatalog(): BestiaryCatalog {
  const entriesByRaceId = new Map<number, BestiaryCatalogEntry>();
  const bossesByRaceId = new Map<number, BossCatalogEntry>();
  const raceIdByMonsterTypeId = new Map<string, number>();
  for (let index = 1; index <= 20; index += 1) {
    const monsterType = makeMonsterType(index);
    entriesByRaceId.set(index, {
      raceId: index,
      className: "Mammal",
      stars: 1,
      occurrence: 0,
      charmPoints: 5,
      firstUnlock: 10,
      secondUnlock: 100,
      toKill: 250,
      locations: "everywhere",
      preyExclusive: false,
      monsterType,
    });
    raceIdByMonsterTypeId.set(monsterType.id, index);
  }
  // Two archfoes and one nemesis; only archfoes are boostable.
  for (const [raceId, category] of [
    [901, "archfoe"],
    [902, "archfoe"],
    [903, "nemesis"],
  ] as const) {
    const monsterType = makeMonsterType(raceId);
    bossesByRaceId.set(raceId, { raceId, category, monsterType });
    raceIdByMonsterTypeId.set(monsterType.id, raceId);
  }
  return { entriesByRaceId, bossesByRaceId, raceIdByMonsterTypeId };
}

function makeSessions() {
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const join = (id: string): { session: Session; sent: ServerMessage[] } => {
    const sent: ServerMessage[] = [];
    const session = {
      id: `session-${id}`,
      playerId: id,
      send: (message: ServerMessage) => sent.push(message),
    } as unknown as Session;
    sessions.set(id, session);
    return { session, sent };
  };
  return { registry, join };
}

function monsterOf(catalog: BestiaryCatalog, raceId: number): Monster {
  const type =
    catalog.entriesByRaceId.get(raceId)?.monsterType ??
    catalog.bossesByRaceId.get(raceId)?.monsterType;
  if (!type) throw new Error(`no type for race ${raceId}`);
  return new Monster({
    id: `monster-${raceId}`,
    type,
    position: { x: 8, y: 8, z: 7 },
    direction: "south",
    home: { x: 8, y: 8, z: 7 },
    spawnRadius: 3,
  });
}

async function flush(service: {
  stop(): Promise<void>;
  applyResolvedOutcomes(now: number): void;
}, now: number) {
  for (let round = 0; round < 4; round += 1) {
    await service.stop();
    service.applyResolvedOutcomes(now);
  }
}

describe("normalRandomIndex", () => {
  it("only produces indexes inside the inclusive range", () => {
    const rng = new WorldActionRng(7);
    for (let draw = 0; draw < 2_000; draw += 1) {
      const index = normalRandomIndex(
        () => rng.integer(0, 999_999_999) / 1_000_000_000,
        0,
        44,
      );
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(44);
    }
  });
});

describe("BoostedService", () => {
  it("selects once per day, excludes yesterday's creature, archfoe bosses only", async () => {
    const catalog = makeCatalog();
    const store = new MemoryBoostedStore();
    const { registry } = makeSessions();
    const service = new BoostedService(
      registry,
      catalog,
      new WorldActionRng(11),
      store,
    );
    service.tick(DAY_ONE);
    await flush(service, DAY_ONE);
    const first = await store.load("2026-07-26");
    expect(first).not.toBeNull();
    expect(catalog.entriesByRaceId.has(first?.creatureRaceId ?? 0)).toBe(true);
    expect([901, 902]).toContain(first?.bossRaceId);

    // Same day: no new row, same selection.
    service.tick(DAY_ONE + 60_000);
    await flush(service, DAY_ONE);
    expect(await store.load("2026-07-27")).toBeNull();

    // Next day: a new selection that never repeats yesterday's creature.
    service.tick(DAY_TWO);
    await flush(service, DAY_TWO);
    const second = await store.load("2026-07-27");
    expect(second).not.toBeNull();
    expect(second?.creatureRaceId).not.toBe(first?.creatureRaceId);
  });

  it("adopts a stored selection instead of re-rolling (exactly-once)", async () => {
    const catalog = makeCatalog();
    const store = new MemoryBoostedStore();
    await store.ensure({
      day: "2026-07-26",
      creatureRaceId: 7,
      creatureName: "Beast 7",
      bossRaceId: 902,
      bossName: "Beast 902",
    });
    const { registry } = makeSessions();
    const service = new BoostedService(
      registry,
      catalog,
      new WorldActionRng(99),
      store,
    );
    service.tick(DAY_ONE);
    await flush(service, DAY_ONE);
    expect(service.boostedCreatureRaceId()).toBe(7);
    expect(service.boostedBossRaceId()).toBe(902);
    // Adoption must not clear slots again (that ran when the row was made).
    expect(store.clearedBossRaceIds).toEqual([]);
  });

  it("applies modifiers only for the selected race", async () => {
    const catalog = makeCatalog();
    const store = new MemoryBoostedStore();
    await store.ensure({
      day: "2026-07-26",
      creatureRaceId: 3,
      creatureName: "Beast 3",
      bossRaceId: 901,
      bossName: "Beast 901",
    });
    const { registry } = makeSessions();
    const service = new BoostedService(
      registry,
      catalog,
      new WorldActionRng(5),
      store,
    );
    service.tick(DAY_ONE);
    await flush(service, DAY_ONE);
    expect(service.isBoostedCreature(monsterOf(catalog, 3))).toBe(true);
    expect(service.isBoostedCreature(monsterOf(catalog, 4))).toBe(false);
    expect(service.respawnDelayDivisor("beast-3")).toBe(2);
    expect(service.respawnDelayDivisor("beast-4")).toBe(1);
    expect(service.bossKillIncrement(901)).toBe(3);
    expect(service.bossKillIncrement(902)).toBe(1);
  });
});

describe("TrackerService (Feature 76)", () => {
  it("tracks own kills only, gates bosses on a kill, and caps at 255", async () => {
    const catalog = makeCatalog();
    const { registry, join } = makeSessions();
    const kills = new BestiaryTracker(catalog, registry);
    const service = new TrackerService(
      registry,
      catalog,
      kills,
      new MemoryTrackerStore(),
    );
    const alice = join(A);
    kills.attach(A, new Map([[901, 2]]));
    service.attachCharacter(alice.session, A);
    await flush(service, 1_000);

    // Bestiary tracking needs no kills; boss tracking does.
    service.handle(alice.session, { type: "tracker-set", scope: "bestiary", raceId: 5, enabled: true }, 1_000);
    service.handle(alice.session, { type: "tracker-set", scope: "bosstiary", raceId: 902, enabled: true }, 2_000);
    service.handle(alice.session, { type: "tracker-set", scope: "bosstiary", raceId: 901, enabled: true }, 3_000);
    const states = alice.sent.filter(
      (message): message is TrackerStateMessage => message.type === "tracker-state",
    );
    const bestiaryState = states.filter((state) => state.scope === "bestiary").at(-1);
    expect(bestiaryState?.entries.map((entry) => entry.raceId)).toEqual([5]);
    const bossState = states.filter((state) => state.scope === "bosstiary").at(-1);
    expect(bossState?.entries.map((entry) => entry.raceId)).toEqual([901]);
    expect(bossState?.entries[0]?.kills).toBe(2);
  });

  it("rate-limits tracker mutations per session", async () => {
    const catalog = makeCatalog();
    const { registry, join } = makeSessions();
    const kills = new BestiaryTracker(catalog, registry);
    const service = new TrackerService(registry, catalog, kills, new MemoryTrackerStore());
    const alice = join(A);
    kills.attach(A, new Map());
    service.attachCharacter(alice.session, A);
    await flush(service, 1_000);
    service.handle(alice.session, { type: "tracker-set", scope: "bestiary", raceId: 1, enabled: true }, 1_000);
    // Inside the cooldown window: silently dropped.
    service.handle(alice.session, { type: "tracker-set", scope: "bestiary", raceId: 2, enabled: true }, 1_100);
    const last = alice.sent
      .filter(
        (message): message is TrackerStateMessage =>
          message.type === "tracker-state" && message.scope === "bestiary",
      )
      .at(-1);
    expect(last?.entries.map((entry) => entry.raceId)).toEqual([1]);
  });
});

describe("BossSlotService (Feature 76)", () => {
  function makeSlotHarness(boostedBossRaceId: number | null = null) {
    const catalog = makeCatalog();
    const { registry, join } = makeSessions();
    const kills = new BestiaryTracker(catalog, registry);
    const store = new MemoryBossSlotStore();
    const service = new BossSlotService(
      registry,
      catalog,
      kills,
      {
        isBoostedCreature: () => false,
        bossKillIncrement: () => 1,
        respawnDelayDivisor: () => 1,
        boostedBossRaceId: () => boostedBossRaceId,
      },
      store,
    );
    return { catalog, kills, store, service, join };
  }

  const lastState = (sent: ServerMessage[]) =>
    sent
      .filter(
        (message): message is BossSlotsStateMessage =>
          message.type === "boss-slots-state",
      )
      .at(-1);

  it("validates unlocks and kill progress at execution time", async () => {
    const harness = makeSlotHarness();
    const alice = harness.join(A);
    harness.kills.attach(A, new Map());
    harness.service.attachCharacter(alice.session, A);
    await flush(harness.service, 1_000);

    // No boss at Prowess yet: the slot is locked.
    harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 0, raceId: 901 }, 1_000);
    expect(alice.sent.at(-1)).toMatchObject({ type: "boss-slot-failed", reason: "slot-locked" });

    // Five archfoe kills reach Prowess; assignment now succeeds.
    harness.kills.attach(A, new Map([[901, 5]]));
    harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 0, raceId: 901 }, 2_000);
    const state = lastState(alice.sent);
    expect(state?.slots[0]?.raceId).toBe(901);
    expect(state?.slotTwoUnlocked).toBe(false);

    // Slot two needs 1500 points; five kills grant only 10.
    harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 1, raceId: 902 }, 3_000);
    expect(alice.sent.at(-1)).toMatchObject({ type: "boss-slot-failed", reason: "slot-locked" });
  });

  it("prices removals on Canary's curve and refuses unfunded ones", async () => {
    const harness = makeSlotHarness();
    const alice = harness.join(A);
    harness.kills.attach(A, new Map([[901, 5], [902, 5]]));
    harness.service.attachCharacter(alice.session, A);
    await flush(harness.service, 500);

    // First two removals are free (removeTimes < 2).
    for (const [assignAt, clearAt] of [
      [1_000, 2_000],
      [3_000, 4_000],
    ] as const) {
      harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 0, raceId: 901 }, assignAt);
      harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 0, raceId: null }, clearAt);
      await flush(harness.service, clearAt);
    }
    let state = lastState(alice.sent);
    expect(state?.slots[0]?.raceId).toBeNull();
    // Third removal costs 300000 * 2 - 500000 = 100000 gold.
    expect(state?.nextRemovePriceGold).toBe(100_000);

    harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 0, raceId: 901 }, 5_000);
    harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 0, raceId: null }, 6_000);
    await flush(harness.service, 6_000);
    expect(alice.sent.at(-1)).toMatchObject({
      type: "boss-slot-failed",
      reason: "insufficient-gold",
    });
    state = lastState(alice.sent);
    expect(state?.slots[0]?.raceId).toBe(901);

    // Funded: the debit and the clear commit together.
    harness.store.setBalance(A, 150_000);
    harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 0, raceId: null }, 7_000);
    await flush(harness.service, 7_000);
    state = lastState(alice.sent);
    expect(state?.slots[0]?.raceId).toBeNull();
    expect(harness.store.balanceOf(A)).toBe(50_000);
    expect(state?.nextRemovePriceGold).toBe(400_000);
  });

  it("keeps the boosted boss out of slots and clears it on rotation", async () => {
    const harness = makeSlotHarness(901);
    const alice = harness.join(A);
    harness.kills.attach(A, new Map([[901, 5], [902, 5]]));
    harness.service.attachCharacter(alice.session, A);
    await flush(harness.service, 500);

    harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 0, raceId: 901 }, 1_000);
    expect(alice.sent.at(-1)).toMatchObject({ type: "boss-slot-failed", reason: "boosted-boss" });

    harness.service.handleSet(alice.session, { type: "boss-slot-set", slot: 0, raceId: 902 }, 2_000);
    const state = lastState(alice.sent);
    expect(state?.slots[0]?.raceId).toBe(902);
    expect(state?.unlockedRaceIds).not.toContain(901);
    expect(state?.boosted?.raceId).toBe(901);

    // Tomorrow 902 becomes boosted: its slot empties without a removal charge.
    harness.service.onBoostedBossRotated(902);
    const rotated = lastState(alice.sent);
    expect(rotated?.slots[0]?.raceId).toBeNull();
    expect(rotated?.nextRemovePriceGold).toBe(0);
  });
});

describe("BestiaryTracker boosted boss multiplier", () => {
  it("credits triple kills for the boosted boss only", () => {
    const catalog = makeCatalog();
    const { registry, join } = makeSessions();
    const tracker = new BestiaryTracker(catalog, registry, undefined, {
      isBoostedCreature: () => false,
      bossKillIncrement: (raceId) => (raceId === 901 ? 3 : 1),
      respawnDelayDivisor: () => 1,
      boostedBossRaceId: () => 901,
    });
    join(A);
    tracker.attach(A, new Map());
    tracker.onMonsterKilled([A], monsterOf(catalog, 901), 1_000);
    tracker.onMonsterKilled([A], monsterOf(catalog, 902), 1_000);
    tracker.onMonsterKilled([A], monsterOf(catalog, 5), 1_000);
    expect(tracker.killsFor(A).get(901)).toBe(3);
    expect(tracker.killsFor(A).get(902)).toBe(1);
    expect(tracker.killsFor(A).get(5)).toBe(1);
  });
});
