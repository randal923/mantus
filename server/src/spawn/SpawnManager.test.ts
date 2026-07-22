import { describe, expect, it } from "vitest";
import type { Combat } from "../combat/Combat";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import type { Visibility } from "../Visibility";
import { World } from "../World";
import type { CreatureContent } from "./CreatureContent";
import { SpawnManager } from "./SpawnManager";

const monsterType: MonsterType = {
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
  race: "blood",
  faction: "default",
  enemyFactions: [],
  flags: {
    attackable: true,
    hostile: false,
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

const visibility = {
  announceCreatureSpawn: () => undefined,
  announceCreatureLeave: () => undefined,
  onCreatureStepped: () => undefined,
  broadcastPose: () => undefined,
  broadcastCreatureSpeech: () => undefined,
} as unknown as Visibility;

const config = {
  activationRange: { x: 10, y: 10 },
  retryMs: 100,
  maxSpawnChecksPerTick: 32,
  maxSpawnAttemptsPerTick: 8,
  maxAiScansPerTick: 32,
  maxAiWorkPerTick: 32,
  ai: {
    thinkIntervalMs: 250,
    acquisitionRange: 8,
    loseRange: 12,
    despawnRadius: 50,
    maxPathNodes: 16,
    wanderChance: 0,
    seed: 123,
  },
};

const makeContent = (enabled = true): CreatureContent => ({
  monsterTypes: new Map([[monsterType.id, monsterType]]),
  npcTypes: new Map(),
  shopCatalogs: new Map(),
  slots: [
    {
      id: "monster:slot-1",
      kind: "monster",
      typeId: "rat",
      home: { x: 3, y: 3, z: 7 },
      radius: 0,
      respawnMs: 1_000,
      direction: "south",
      enabled,
    },
  ],
});

const makeWorld = (blocked: ReadonlyArray<readonly [number, number]> = []) => {
  const world = new World(
    gridMapData({ name: "test", width: 8, height: 8, blocked }),
    25,
  );
  world.addPlayer(new Player(makeCharacter("viewer"), { x: 1, y: 1, z: 7 }));
  return world;
};

describe("SpawnManager", () => {
  it("never creates two live creatures for one slot under repeated ticks", () => {
    const world = makeWorld();
    const manager = new SpawnManager(world, visibility, makeContent(), config);

    manager.tick(1_000);
    const first = manager.activeCreatureId("monster:slot-1");
    manager.tick(1_000);
    manager.tick(2_000);

    expect(first).not.toBeNull();
    expect(manager.activeCreatureId("monster:slot-1")).toBe(first);
    expect([...world.allCreatures()].filter((creature) => creature.kind === "monster"))
      .toHaveLength(1);
  });

  it("schedules exactly one respawn and uses a fresh instance id", () => {
    const world = makeWorld();
    const manager = new SpawnManager(world, visibility, makeContent(), config);
    manager.tick(1_000);
    const first = manager.activeCreatureId("monster:slot-1");
    if (!first) throw new Error("expected initial creature");

    expect(manager.removeCreature(first, 2_000)).toBe(true);
    expect(manager.removeCreature(first, 2_000)).toBe(false);
    expect(manager.nextSpawnDeadline("monster:slot-1")).toBe(3_000);
    manager.tick(2_999);
    expect(manager.activeCreatureId("monster:slot-1")).toBeNull();
    manager.tick(3_000);

    const second = manager.activeCreatureId("monster:slot-1");
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it("divides ordinary respawn delays by the global spawn rate", () => {
    const world = makeWorld();
    const manager = new SpawnManager(
      world,
      visibility,
      makeContent(),
      config,
      undefined,
      2,
    );
    manager.tick(1_000);
    const first = manager.activeCreatureId("monster:slot-1");
    if (!first) throw new Error("expected initial creature");

    expect(manager.removeCreature(first, 2_000)).toBe(true);
    expect(manager.nextSpawnDeadline("monster:slot-1")).toBe(2_500);
    manager.tick(2_499);
    expect(manager.activeCreatureId("monster:slot-1")).toBeNull();
    manager.tick(2_500);
    expect(manager.activeCreatureId("monster:slot-1")).not.toBeNull();
  });

  it("retries occupied and blocked homes without teleporting or overlapping", () => {
    const occupiedWorld = makeWorld();
    const blocker = new Player(makeCharacter("blocker"), { x: 3, y: 3, z: 7 });
    occupiedWorld.addPlayer(blocker);
    const occupied = new SpawnManager(
      occupiedWorld,
      visibility,
      makeContent(),
      config,
    );
    occupied.tick(1_000);
    expect(occupied.activeCreatureId("monster:slot-1")).toBeNull();
    expect(occupied.nextSpawnDeadline("monster:slot-1")).toBe(1_100);

    occupiedWorld.removePlayer(blocker.id);
    occupied.tick(1_100);
    expect(occupied.activeCreatureId("monster:slot-1")).not.toBeNull();

    const blockedWorld = makeWorld([[3, 3]]);
    const blocked = new SpawnManager(blockedWorld, visibility, makeContent(), config);
    blocked.tick(1_000);
    blocked.tick(1_100);
    expect(blocked.activeCreatureId("monster:slot-1")).toBeNull();
    expect([...blockedWorld.allCreatures()].filter((creature) => creature.kind === "monster"))
      .toHaveLength(0);
  });

  it("resets ordinary ephemeral deadlines after a process restart", () => {
    const firstWorld = makeWorld();
    const firstManager = new SpawnManager(
      firstWorld,
      visibility,
      makeContent(),
      config,
    );
    firstManager.tick(1_000);
    const first = firstManager.activeCreatureId("monster:slot-1");
    if (!first) throw new Error("expected initial creature");
    firstManager.removeCreature(first, 2_000);
    expect(firstManager.nextSpawnDeadline("monster:slot-1")).toBe(3_000);

    const restartedWorld = makeWorld();
    const restarted = new SpawnManager(
      restartedWorld,
      visibility,
      makeContent(),
      config,
    );
    restarted.tick(2_001);

    expect(restarted.activeCreatureId("monster:slot-1")).not.toBeNull();
  });

  it("preserves creature identity and health while its region is inactive", () => {
    const world = makeWorld();
    const manager = new SpawnManager(world, visibility, makeContent(), config);
    manager.tick(1_000);
    const first = manager.activeCreatureId("monster:slot-1");
    if (!first) throw new Error("expected initial creature");
    const creature = world.getCreature(first);
    if (!creature) throw new Error("expected creature in world");
    creature.setHealth(7);

    world.removePlayer("viewer");
    manager.tick(1_250);
    expect(manager.activeCreatureId("monster:slot-1")).toBeNull();
    expect(world.getCreature(first)).toBeUndefined();

    world.addPlayer(
      new Player(makeCharacter("viewer"), { x: 1, y: 1, z: 7 }),
    );
    manager.tick(1_500);

    expect(manager.activeCreatureId("monster:slot-1")).toBe(first);
    expect(world.getCreature(first)?.health).toBe(7);
  });

  it("transforms a live monster without detaching its ordinary spawn slot", () => {
    const transformedType: MonsterType = {
      ...monsterType,
      id: "transformed-rat",
      name: "Transformed Rat",
      health: 40,
      maxHealth: 40,
    };
    const content = makeContent();
    const world = makeWorld();
    const manager = new SpawnManager(
      world,
      visibility,
      {
        ...content,
        monsterTypes: new Map([
          ...content.monsterTypes,
          [transformedType.id, transformedType],
        ]),
      },
      config,
    );
    manager.tick(1_000);
    const creatureId = manager.activeCreatureId("monster:slot-1");
    if (!creatureId) throw new Error("expected initial creature");

    expect(
      manager.transformMonster(creatureId, transformedType.id, 1_100),
    ).toBe(true);
    expect(manager.activeCreatureId("monster:slot-1")).toBe(creatureId);
    const transformed = world.getCreature(creatureId);
    expect(transformed).toBeInstanceOf(Monster);
    expect((transformed as Monster).type.id).toBe(transformedType.id);

    expect(manager.removeCreature(creatureId, 2_000)).toBe(true);
    manager.tick(3_000);
    const respawnedId = manager.activeCreatureId("monster:slot-1");
    if (!respawnedId) throw new Error("expected respawned creature");
    expect((world.getCreature(respawnedId) as Monster).type.id).toBe(
      monsterType.id,
    );
  });

  it("enforces summon limits and removes owned summons with their owner", () => {
    const summonType: MonsterType = { ...monsterType };
    const ownerType: MonsterType = {
      ...monsterType,
      id: "summoner",
      name: "Summoner",
      flags: { ...monsterType.flags, hostile: true },
      maxSummons: 1,
      summons: [
        { typeId: summonType.id, intervalMs: 100, chance: 100, maxCount: 1 },
      ],
    };
    const content: CreatureContent = {
      monsterTypes: new Map([
        [ownerType.id, ownerType],
        [summonType.id, summonType],
      ]),
      npcTypes: new Map(),
      shopCatalogs: new Map(),
      slots: [
        {
          id: "monster:summoner",
          kind: "monster",
          typeId: ownerType.id,
          home: { x: 3, y: 3, z: 7 },
          radius: 3,
          respawnMs: 1_000,
          direction: "south",
          enabled: true,
        },
      ],
    };
    const world = makeWorld();
    const manager = new SpawnManager(
      world,
      visibility,
      content,
      config,
      {} as Combat,
    );
    manager.tick(1_000);
    const ownerId = manager.activeCreatureId("monster:summoner");
    if (!ownerId) throw new Error("expected summoner");

    manager.tick(1_500);
    manager.tick(2_000);

    expect(
      [...world.allCreatures()].filter(
        (creature) => creature.kind === "monster",
      ),
    ).toHaveLength(2);
    expect(manager.removeCreature(ownerId, 2_500)).toBe(true);
    expect(
      [...world.allCreatures()].filter(
        (creature) => creature.kind === "monster",
      ),
    ).toHaveLength(0);
  });
});
