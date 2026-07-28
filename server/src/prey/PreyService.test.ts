import { describe, expect, it } from "vitest";
import type { PreyStateMessage, ServerMessage } from "@tibia/protocol";
import { PREY_RULES } from "@tibia/protocol";
import { WorldActionRng } from "../action/WorldActionRng";
import type { BestiaryCatalog, BestiaryCatalogEntry } from "../bestiary/BestiaryCatalog";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { MemoryPreyStore } from "./MemoryPreyStore";
import { preyBonusPercentageFor } from "./preyBonusRoll";
import { PreyService } from "./PreyService";

const A = "00000000-0000-4000-8000-00000000000a";

function makeMonsterType(raceIndex: number): MonsterType {
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
      rewardBoss: false,
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

function makeCatalog(size = 45): BestiaryCatalog {
  const entriesByRaceId = new Map<number, BestiaryCatalogEntry>();
  const raceIdByMonsterTypeId = new Map<string, number>();
  for (let index = 1; index <= size; index += 1) {
    const monsterType = makeMonsterType(index);
    entriesByRaceId.set(index, {
      raceId: index,
      className: "Mammal",
      stars: (index % 4) + 1,
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
  return { entriesByRaceId, bossesByRaceId: new Map(), raceIdByMonsterTypeId };
}

function makeHarness(options?: { premium?: boolean; catalog?: BestiaryCatalog }) {
  const world = new World(
    gridMapData({ name: "prey", width: 40, height: 40, blocked: [], floors: [7] }),
    25,
  );
  const catalog = options?.catalog ?? makeCatalog();
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const store = new MemoryPreyStore();
  const service = new PreyService(
    world,
    registry,
    catalog,
    new WorldActionRng(41),
    store,
  );
  return {
    world,
    catalog,
    store,
    service,
    join(id: string, level = 50): { session: Session; sent: ServerMessage[] } {
      const player = new Player(
        {
          ...makeCharacter(id, `Hunter ${id.slice(-1)}`),
          level,
          experience: BigInt(getExperienceForLevel(level)),
        },
        { x: 6, y: 6, z: 7 },
        0,
        options?.premium ? new Date(Date.now() + 86_400_000) : null,
      );
      world.addPlayer(player);
      const sent: ServerMessage[] = [];
      const session = {
        id: `session-${id}`,
        playerId: id,
        send: (message: ServerMessage) => sent.push(message),
        sendError: () => {},
      } as unknown as Session;
      sessions.set(id, session);
      service.attachCharacter(session, id);
      return { session, sent };
    },
    monsterOf(raceId: number): Monster {
      const entry = catalog.entriesByRaceId.get(raceId);
      if (!entry) throw new Error(`no catalog entry for race ${raceId}`);
      return new Monster({
        id: `monster-${raceId}`,
        type: entry.monsterType,
        position: { x: 8, y: 8, z: 7 },
        direction: "south",
        home: { x: 8, y: 8, z: 7 },
        spawnRadius: 3,
      });
    },
    async flush(now = 1_000) {
      for (let round = 0; round < 4; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
    },
  };
}

const statesOf = (sent: ServerMessage[]): PreyStateMessage[] =>
  sent.filter(
    (message): message is PreyStateMessage => message.type === "prey-state",
  );

const failuresOf = (sent: ServerMessage[]) =>
  sent.filter((message) => message.type === "prey-action-failed");

describe("PreyService", () => {
  it("initializes fresh slots: one open grid, premium and store locks", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();

    const state = statesOf(alice.sent).at(-1);
    expect(state).toBeDefined();
    expect(state?.slots[0]?.state).toBe("selection");
    expect(state?.slots[0]?.grid).toHaveLength(9);
    expect(state?.slots[1]?.state).toBe("locked");
    expect(state?.slots[1]?.unlock).toBe("premium");
    expect(state?.slots[2]?.state).toBe("locked");
    expect(state?.slots[2]?.unlock).toBe("store");
    expect(state?.wildcards).toBe(0);
    expect(state?.listRerollPriceGold).toBe(
      50 * PREY_RULES.listRerollPricePerLevel,
    );
  });

  it("unlocks the second slot for premium characters", async () => {
    const harness = makeHarness({ premium: true });
    const alice = harness.join(A);
    await harness.flush();

    const state = statesOf(alice.sent).at(-1);
    expect(state?.slots[1]?.state).toBe("selection");
    expect(state?.slots[1]?.grid).toHaveLength(9);
    // The two grids never overlap (cross-slot blacklist).
    const first = new Set(state?.slots[0]?.grid.map((entry) => entry.raceId));
    for (const entry of state?.slots[1]?.grid ?? []) {
      expect(first.has(entry.raceId)).toBe(false);
    }
  });

  it("activates a grid pick with a server-rolled bonus and full timer", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "select-monster", index: 2 },
      2_000,
    );
    await harness.flush(2_000);

    const state = statesOf(alice.sent).at(-1);
    const slot = state?.slots[0];
    expect(slot?.state).toBe("active");
    expect(slot?.selected).not.toBeNull();
    expect(slot?.bonusTimeLeftSeconds).toBe(PREY_RULES.bonusTimeSeconds);
    expect(slot?.grid).toHaveLength(8);
    expect(slot?.bonus).not.toBeNull();
    // First-ever roll starts from rarity 1, so the new rarity is 2-10 and
    // the percentage matches the pinned formula for the rolled type.
    expect(slot?.bonus?.rarity).toBeGreaterThanOrEqual(2);
    expect(slot?.bonus?.percentage).toBe(
      preyBonusPercentageFor(slot?.bonus?.type ?? "damage", slot?.bonus?.rarity ?? 1),
    );
  });

  it("applies bonuses only against the slot's own race at execution time", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "select-monster", index: 0 },
      2_000,
    );
    await harness.flush(2_000);

    const slot = statesOf(alice.sent).at(-1)?.slots[0];
    const raceId = slot?.selected?.raceId ?? 0;
    const bonusType = slot?.bonus?.type ?? "damage";
    const percentage = slot?.bonus?.percentage ?? 0;
    const prey = harness.monsterOf(raceId);
    const other = harness.monsterOf(raceId === 1 ? 2 : 1);

    const byType = {
      damage: harness.service.damageBoostPercent(A, prey),
      defense: harness.service.damageReductionPercent(A, prey),
      experience: harness.service.experienceBonusPercent(A, prey),
      loot: harness.service.improvedLootPercent(A, prey),
    };
    expect(byType[bonusType]).toBe(percentage);
    for (const [type, value] of Object.entries(byType)) {
      if (type !== bonusType) expect(value).toBe(0);
    }
    // A different race never benefits.
    expect(harness.service.damageBoostPercent(A, other)).toBe(0);
    expect(harness.service.experienceBonusPercent(A, other)).toBe(0);
  });

  it("charges gold exactly once for racing paid list rerolls", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    harness.store.setGold(A, 10_000);

    // Same tick, two paid rerolls: the second is refused while the first
    // charge is still in flight, so exactly one debit lands.
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "list-reroll" },
      2_000,
    );
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "list-reroll" },
      2_400,
    );
    await harness.flush(3_000);

    expect(harness.store.goldOf(A)).toBe(10_000 - 50 * 200);
    expect(
      harness.store.auditEvents.filter(
        (event) => event.event === "prey-list-reroll",
      ),
    ).toHaveLength(1);
    expect(failuresOf(alice.sent).length).toBeGreaterThanOrEqual(1);
  });

  it("refuses a paid reroll the bank cannot cover", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    harness.store.setGold(A, 100);
    const before = statesOf(alice.sent).at(-1)?.slots[0]?.grid;

    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "list-reroll" },
      2_000,
    );
    await harness.flush(3_000);

    expect(harness.store.goldOf(A)).toBe(100);
    const failure = failuresOf(alice.sent).at(-1);
    expect(failure).toMatchObject({ reason: "insufficient-gold" });
    const after = statesOf(alice.sent).at(-1)?.slots[0]?.grid;
    expect(after).toEqual(before);
  });

  it("rerolls the bonus for one wildcard, never below the current rarity", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "select-monster", index: 0 },
      2_000,
    );
    await harness.flush(2_000);
    const before = statesOf(alice.sent).at(-1)?.slots[0]?.bonus;

    // Without wildcards the reroll is refused at the advisory check.
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "bonus-reroll" },
      3_000,
    );
    expect(failuresOf(alice.sent).at(-1)).toMatchObject({
      reason: "insufficient-wildcards",
    });

    harness.store.setWildcards(A, 3);
    harness.service.grantWildcards(A, 0);
    await harness.flush(3_000);
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "bonus-reroll" },
      4_000,
    );
    await harness.flush(4_000);

    const state = statesOf(alice.sent).at(-1);
    const bonus = state?.slots[0]?.bonus;
    expect(bonus?.rarity ?? 0).toBeGreaterThanOrEqual(before?.rarity ?? 99);
    expect(state?.slots[0]?.bonusTimeLeftSeconds).toBe(
      PREY_RULES.bonusTimeSeconds,
    );
    expect(state?.wildcards).toBe(2);
  });

  it("drains hunting time in 60/120s chunks and expires into a fresh grid", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "select-monster", index: 0 },
      2_000,
    );
    await harness.flush(2_000);

    // First gain: past the fresh checkpoint by more than 60s → 120s chunk.
    harness.service.onHuntExperienceGained(A, 500_000);
    let slot = statesOf(alice.sent).at(-1)?.slots[0];
    expect(slot?.bonusTimeLeftSeconds).toBe(PREY_RULES.bonusTimeSeconds - 120);

    // Within the checkpoint window nothing drains.
    harness.service.onHuntExperienceGained(A, 550_000);
    slot = statesOf(alice.sent).at(-1)?.slots[0];
    expect(slot?.bonusTimeLeftSeconds).toBe(PREY_RULES.bonusTimeSeconds - 120);

    // Drain to expiry: no option → bonus erased, state back to selection
    // with a fresh 9-monster grid.
    let clock = 700_000_000;
    for (let index = 0; index < 70; index += 1) {
      clock += 200_000;
      harness.service.onHuntExperienceGained(A, clock);
    }
    await harness.flush(clock);
    slot = statesOf(alice.sent).at(-1)?.slots[0];
    expect(slot?.state).toBe("selection");
    expect(slot?.bonus).toBeNull();
    expect(slot?.selected).toBeNull();
    expect(slot?.grid).toHaveLength(9);
  });

  it("cancels an active prey when opening the wildcard list and rejects duplicates", async () => {
    const harness = makeHarness({ premium: true });
    const alice = harness.join(A);
    await harness.flush();
    harness.store.setWildcards(A, 20);
    harness.service.grantWildcards(A, 0);
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "wildcard-list" },
      2_000,
    );
    await harness.flush(2_000);
    let state = statesOf(alice.sent).at(-1);
    expect(state?.slots[0]?.state).toBe("list-selection");
    expect(state?.listSelectionPool).not.toBeNull();

    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "wildcard-select", raceId: 7 },
      3_000,
    );
    await harness.flush(3_000);
    state = statesOf(alice.sent).at(-1);
    expect(state?.slots[0]?.selected?.raceId).toBe(7);

    // The second slot cannot pick the same race.
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 1, action: "wildcard-list" },
      4_000,
    );
    await harness.flush(4_000);
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 1, action: "wildcard-select", raceId: 7 },
      5_000,
    );
    await harness.flush(5_000);
    expect(failuresOf(alice.sent).at(-1)).toMatchObject({
      reason: "duplicate-race",
    });
  });

  it("refuses everything on a locked slot", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 2, action: "list-reroll" },
      2_000,
    );
    expect(failuresOf(alice.sent).at(-1)).toMatchObject({
      reason: "slot-locked",
    });
  });

  it("refuses paid options the wildcard balance cannot fund, but always allows none", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();

    // 0 wildcards: both paid options are refused; the slot stays on "none"
    // no matter how often the intent is replayed.
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "set-option", option: "auto-reroll" },
      2_000,
    );
    expect(failuresOf(alice.sent).at(-1)).toMatchObject({
      reason: "insufficient-wildcards",
    });
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "set-option", option: "lock" },
      3_000,
    );
    expect(failuresOf(alice.sent).at(-1)).toMatchObject({
      reason: "insufficient-wildcards",
    });
    expect(statesOf(alice.sent).at(-1)?.slots[0]?.option).toBe("none");

    // A funded balance lets the option stick.
    harness.store.setWildcards(A, PREY_RULES.lockPrice);
    harness.service.grantWildcards(A, 0);
    await harness.flush(3_000);
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "set-option", option: "lock" },
      4_000,
    );
    expect(statesOf(alice.sent).at(-1)?.slots[0]?.option).toBe("lock");

    // Clearing back to "none" needs no funds.
    harness.store.setWildcards(A, 0);
    harness.service.grantWildcards(A, 0);
    await harness.flush(4_000);
    harness.service.handle(
      alice.session,
      { type: "prey-action", slot: 0, action: "set-option", option: "none" },
      5_000,
    );
    expect(statesOf(alice.sent).at(-1)?.slots[0]?.option).toBe("none");
  });
});
