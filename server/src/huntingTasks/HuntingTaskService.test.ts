import { describe, expect, it } from "vitest";
import type { ServerMessage, TaskHuntingStateMessage } from "@tibia/protocol";
import { TASK_HUNTING_RULES, taskHuntingOptionFor } from "@tibia/protocol";
import { WorldActionRng } from "../action/WorldActionRng";
import type {
  BestiaryCatalog,
  BestiaryCatalogEntry,
} from "../bestiary/BestiaryCatalog";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { HuntingTaskService } from "./HuntingTaskService";
import { MemoryHuntingTaskStore } from "./MemoryHuntingTaskStore";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

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
      // All 1★ → every task is Easy (25/50 kills), keeping goals small.
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
  return { entriesByRaceId, bossesByRaceId: new Map(), raceIdByMonsterTypeId };
}

function makeHarness(options?: { bestiaryKills?: Map<number, number> }) {
  const world = new World(
    gridMapData({ name: "tasks", width: 40, height: 40, blocked: [], floors: [7] }),
    25,
  );
  const catalog = makeCatalog();
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const store = new MemoryHuntingTaskStore();
  const service = new HuntingTaskService(
    world,
    registry,
    catalog,
    new WorldActionRng(43),
    () => options?.bestiaryKills ?? new Map(),
    store,
  );
  let nextSpawnX = 4;
  return {
    world,
    catalog,
    store,
    service,
    join(id: string, level = 50): { session: Session; sent: ServerMessage[] } {
      nextSpawnX += 2;
      const player = new Player(
        {
          ...makeCharacter(id, `Tasker ${id.slice(-1)}`),
          level,
          experience: BigInt(getExperienceForLevel(level)),
        },
        { x: nextSpawnX, y: 6, z: 7 },
        0,
        null,
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

const statesOf = (sent: ServerMessage[]): TaskHuntingStateMessage[] =>
  sent.filter(
    (message): message is TaskHuntingStateMessage =>
      message.type === "hunting-tasks-state",
  );

const failuresOf = (sent: ServerMessage[]) =>
  sent.filter((message) => message.type === "hunting-task-action-failed");

async function selectFirstGridRace(
  harness: ReturnType<typeof makeHarness>,
  target: { session: Session; sent: ServerMessage[] },
  upgrade = false,
): Promise<number> {
  const state = statesOf(target.sent).at(-1);
  const raceId = state?.slots[0]?.grid[0]?.raceId;
  if (!raceId) throw new Error("no grid entry to select");
  harness.service.handle(
    target.session,
    {
      type: "hunting-task-action",
      slot: 0,
      action: "select-monster",
      raceId,
      upgrade,
    },
    2_000,
  );
  await harness.flush(2_000);
  return raceId;
}

describe("HuntingTaskService", () => {
  it("initializes fresh slots with a 1★ task offer", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();

    const state = statesOf(alice.sent).at(-1);
    expect(state?.slots[0]?.state).toBe("selection");
    expect(state?.slots[0]?.grid).toHaveLength(9);
    expect(state?.slots[0]?.rarity).toBe(1);
    expect(state?.slots[1]?.state).toBe("locked");
    expect(state?.slots[2]?.state).toBe("locked");
    expect(state?.taskPoints).toBe(0);
  });

  it("credits kills only through the server death path and completes at the goal", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    const raceId = await selectFirstGridRace(harness, alice);
    const option = taskHuntingOptionFor(1, 1);
    expect(option?.firstKills).toBe(25);

    const monster = harness.monsterOf(raceId);
    for (let kill = 0; kill < 24; kill += 1) {
      harness.service.onMonsterKilled([A], monster, 3_000 + kill);
    }
    let slot = statesOf(alice.sent).at(-1)?.slots[0];
    expect(slot?.kills).toBe(24);
    expect(slot?.state).toBe("active");

    // A kill of a different race never counts.
    harness.service.onMonsterKilled([A], harness.monsterOf(raceId === 1 ? 2 : 1), 3_100);
    slot = statesOf(alice.sent).at(-1)?.slots[0];
    expect(slot?.kills).toBe(24);

    harness.service.onMonsterKilled([A], monster, 3_200);
    slot = statesOf(alice.sent).at(-1)?.slots[0];
    expect(slot?.kills).toBe(25);
    expect(slot?.state).toBe("completed");

    // Kills keep counting past the goal (Canary behavior).
    harness.service.onMonsterKilled([A], monster, 3_300);
    slot = statesOf(alice.sent).at(-1)?.slots[0];
    expect(slot?.kills).toBe(26);
  });

  it("ignores kills for damagers without a matching selection", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    const bob = harness.join(B);
    await harness.flush();
    const raceId = await selectFirstGridRace(harness, alice);

    harness.service.onMonsterKilled([A, B], harness.monsterOf(raceId), 3_000);
    expect(statesOf(alice.sent).at(-1)?.slots[0]?.kills).toBe(1);
    const bobSlot = statesOf(bob.sent).at(-1)?.slots[0];
    expect(bobSlot?.kills).toBe(0);
  });

  it("claims exactly once, grants audited points, and exhausts the slot", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    const raceId = await selectFirstGridRace(harness, alice);
    const monster = harness.monsterOf(raceId);
    for (let kill = 0; kill < 25; kill += 1) {
      harness.service.onMonsterKilled([A], monster, 3_000 + kill);
    }

    harness.service.handle(
      alice.session,
      { type: "hunting-task-action", slot: 0, action: "claim" },
      10_000,
    );
    await harness.flush(10_000);

    const state = statesOf(alice.sent).at(-1);
    // 1★ easy first tier: 10 points, no boost below 4★.
    expect(state?.taskPoints).toBe(10);
    expect(harness.store.taskPointsOf(A)).toBe(10);
    expect(state?.slots[0]?.state).toBe("inactive");
    expect(state?.slots[0]?.disabledForSeconds).toBeGreaterThan(0);
    expect(state?.slots[0]?.kills).toBe(0);
    expect(
      harness.store.auditEvents.filter(
        (event) => event.event === "hunting-task-claim",
      ),
    ).toHaveLength(1);

    // A replayed claim finds nothing claimable.
    harness.service.handle(
      alice.session,
      { type: "hunting-task-action", slot: 0, action: "claim" },
      11_000,
    );
    await harness.flush(11_000);
    expect(harness.store.taskPointsOf(A)).toBe(10);
    expect(failuresOf(alice.sent).length).toBeGreaterThanOrEqual(1);
  });

  it("refuses racing same-tick claims while the first is in flight", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    const raceId = await selectFirstGridRace(harness, alice);
    const monster = harness.monsterOf(raceId);
    for (let kill = 0; kill < 25; kill += 1) {
      harness.service.onMonsterKilled([A], monster, 3_000 + kill);
    }

    harness.service.handle(
      alice.session,
      { type: "hunting-task-action", slot: 0, action: "claim" },
      10_000,
    );
    harness.service.handle(
      alice.session,
      { type: "hunting-task-action", slot: 0, action: "claim" },
      10_500,
    );
    await harness.flush(11_000);

    expect(harness.store.taskPointsOf(A)).toBe(10);
    expect(
      harness.store.auditEvents.filter(
        (event) => event.event === "hunting-task-claim",
      ),
    ).toHaveLength(1);
  });

  it("rejects a claim below the goal", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    const raceId = await selectFirstGridRace(harness, alice);
    harness.service.onMonsterKilled([A], harness.monsterOf(raceId), 3_000);

    harness.service.handle(
      alice.session,
      { type: "hunting-task-action", slot: 0, action: "claim" },
      10_000,
    );
    await harness.flush(10_000);
    expect(failuresOf(alice.sent).at(-1)).toMatchObject({
      reason: "goal-not-met",
    });
    expect(harness.store.taskPointsOf(A)).toBe(0);
  });

  it("only honors the upgrade for a completed bestiary entry", async () => {
    const withKills = makeHarness({
      bestiaryKills: new Map([[1, 250]]),
    });
    const alice = withKills.join(A);
    await withKills.flush();
    const state = statesOf(alice.sent).at(-1);
    const gridEntry = state?.slots[0]?.grid.find((entry) => entry.raceId === 1);
    if (gridEntry) {
      expect(gridEntry.upgradeUnlocked).toBe(true);
      withKills.service.handle(
        alice.session,
        {
          type: "hunting-task-action",
          slot: 0,
          action: "select-monster",
          raceId: 1,
          upgrade: true,
        },
        2_000,
      );
      await withKills.flush(2_000);
      const selected = statesOf(alice.sent).at(-1)?.slots[0];
      expect(selected?.upgrade).toBe(true);
      expect(selected?.goalKills).toBe(50);
      return;
    }
    // Race 1 not offered in this grid: upgrade must be stripped instead.
    const other = makeHarness();
    const carol = other.join(A);
    await other.flush();
    await selectFirstGridRace(other, carol, true);
    const selected = statesOf(carol.sent).at(-1)?.slots[0];
    expect(selected?.upgrade).toBe(false);
    expect(selected?.goalKills).toBe(25);
  });

  it("charges gold for cancel and rerolls the slot", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    await selectFirstGridRace(harness, alice);
    harness.store.setGold(A, 20_000);

    harness.service.handle(
      alice.session,
      { type: "hunting-task-action", slot: 0, action: "cancel" },
      10_000,
    );
    await harness.flush(10_000);

    expect(harness.store.goldOf(A)).toBe(
      20_000 - 50 * TASK_HUNTING_RULES.rerollPricePerLevel,
    );
    const slot = statesOf(alice.sent).at(-1)?.slots[0];
    expect(slot?.state).toBe("selection");
    expect(slot?.selected).toBeNull();
    expect(slot?.grid).toHaveLength(9);
    // Post-cancel star comes from the reroll table: always at least 2★.
    expect(slot?.rarity).toBeGreaterThanOrEqual(2);
  });

  it("blocks list rerolls while the slot is exhausted", async () => {
    const harness = makeHarness();
    const alice = harness.join(A);
    await harness.flush();
    const raceId = await selectFirstGridRace(harness, alice);
    const monster = harness.monsterOf(raceId);
    for (let kill = 0; kill < 25; kill += 1) {
      harness.service.onMonsterKilled([A], monster, 3_000 + kill);
    }
    harness.service.handle(
      alice.session,
      { type: "hunting-task-action", slot: 0, action: "claim" },
      10_000,
    );
    await harness.flush(10_000);

    harness.service.handle(
      alice.session,
      { type: "hunting-task-action", slot: 0, action: "list-reroll" },
      11_000,
    );
    expect(failuresOf(alice.sent).at(-1)).toMatchObject({
      reason: "exhausted",
    });
  });
});
