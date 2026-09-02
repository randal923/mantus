import { describe, expect, it } from "vitest";
import type { Position } from "@tibia/protocol";
import type { Combat } from "../combat/Combat";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { makeNpcType } from "../test/makeNpcType";
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

const visibility = {
  announceCreatureSpawn: () => undefined,
  announceCreatureLeave: () => undefined,
  onCreatureStepped: () => undefined,
  broadcastPose: () => undefined,
  broadcastCreatureSpeech: () => undefined,
  broadcastMagicEffect: () => undefined,
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

/** A 16x16 map whose north-west 7x7 corner is one town protection zone. */
const makeProtectionZoneWorld = () => {
  const protectionZones: Array<readonly [number, number, number]> = [];
  for (let y = 0; y <= 6; y++) {
    for (let x = 0; x <= 6; x++) protectionZones.push([x, y, 7]);
  }
  const world = new World(
    gridMapData({
      name: "test",
      width: 16,
      height: 16,
      blocked: [],
      protectionZones,
    }),
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

  it("puts a lured monster back home when it cannot walk there", () => {
    // Home (3,3) is walled off from the rest of the floor: a monster left
    // outside the ring has no route back, so after 30s without progress the
    // spawn teleports it onto its home tile.
    const ring: Array<readonly [number, number]> = [];
    for (let x = 2; x <= 4; x++) ring.push([x, 2], [x, 4]);
    ring.push([2, 3], [4, 3]);
    const world = makeWorld(ring);
    const effects: Array<{ x: number; y: number; effectId: number }> = [];
    const steps: Array<{ from: { x: number; y: number }; durationMs: number }> =
      [];
    const manager = new SpawnManager(
      world,
      {
        ...visibility,
        broadcastMagicEffect: (position: Position, effectId: number) =>
          effects.push({ x: position.x, y: position.y, effectId }),
        onCreatureStepped: (
          _creature: Creature,
          from: Position,
          durationMs: number,
        ) => steps.push({ from: { x: from.x, y: from.y }, durationMs }),
      } as unknown as Visibility,
      makeContent(),
      config,
    );
    manager.tick(1_000);
    const id = manager.activeCreatureId("monster:slot-1");
    if (!id) throw new Error("expected initial creature");
    const monster = world.getCreature(id);
    if (!monster) throw new Error("expected creature in world");
    world.relocateCreature(monster, { x: 6, y: 6, z: 7 });

    for (let now = 1_250; now <= 20_000; now += 250) manager.tick(now);
    expect(monster.position).not.toEqual({ x: 3, y: 3, z: 7 });
    expect(steps.filter((step) => step.durationMs === 0)).toHaveLength(0);

    for (let now = 20_250; now <= 40_000; now += 250) manager.tick(now);

    expect(monster.position).toEqual({ x: 3, y: 3, z: 7 });
    expect(manager.activeCreatureId("monster:slot-1")).toBe(id);
    expect(steps.filter((step) => step.durationMs === 0)).toHaveLength(1);
    expect(effects.map((effect) => effect.effectId)).toEqual([11, 11]);
    expect(effects[1]).toEqual({ x: 3, y: 3, effectId: 11 });
  });

  it("restores a creature that went dormant on a blockpath tile", () => {
    // The Darashia NPC report: she idled onto a tile a table makes
    // unpathable, the region went quiet, and the restore kept retrying that
    // one tile forever — she never came back until the process restarted.
    const blockpath = { x: 4, y: 3, z: 7 };
    const world = new World(
      gridMapData({
        name: "test",
        width: 8,
        height: 8,
        blocked: [],
        blocksPath: [[blockpath.x, blockpath.y, blockpath.z]],
      }),
      25,
    );
    world.addPlayer(new Player(makeCharacter("viewer"), { x: 1, y: 1, z: 7 }));
    const manager = new SpawnManager(world, visibility, makeContent(), config);
    manager.tick(1_000);
    const first = manager.activeCreatureId("monster:slot-1");
    if (!first) throw new Error("expected initial creature");
    const creature = world.getCreature(first);
    if (!creature) throw new Error("expected creature in world");
    world.relocateCreature(creature, blockpath);

    world.removePlayer("viewer");
    manager.tick(1_250);
    expect(manager.activeCreatureId("monster:slot-1")).toBeNull();

    world.addPlayer(new Player(makeCharacter("viewer"), { x: 1, y: 1, z: 7 }));
    manager.tick(1_500);

    expect(manager.activeCreatureId("monster:slot-1")).toBe(first);
    expect(world.getCreature(first)?.position).toEqual(blockpath);
  });

  it("falls back to the slot home when the dormant tile is taken", () => {
    const world = makeWorld();
    const manager = new SpawnManager(world, visibility, makeContent(), config);
    manager.tick(1_000);
    const first = manager.activeCreatureId("monster:slot-1");
    if (!first) throw new Error("expected initial creature");
    const creature = world.getCreature(first);
    if (!creature) throw new Error("expected creature in world");
    const wandered = { x: 4, y: 3, z: 7 };
    world.relocateCreature(creature, wandered);

    world.removePlayer("viewer");
    manager.tick(1_250);
    expect(manager.activeCreatureId("monster:slot-1")).toBeNull();

    // Someone arrives standing exactly where it went dormant.
    world.addPlayer(new Player(makeCharacter("viewer"), wandered));
    manager.tick(1_500);

    expect(manager.activeCreatureId("monster:slot-1")).toBe(first);
    expect(world.getCreature(first)?.position).toEqual({ x: 3, y: 3, z: 7 });
  });

  it("spawns on a blockpath home tile, as Canary's placeCreature does", () => {
    const world = new World(
      gridMapData({
        name: "test",
        width: 8,
        height: 8,
        blocked: [],
        blocksPath: [[3, 3, 7]],
      }),
      25,
    );
    world.addPlayer(new Player(makeCharacter("viewer"), { x: 1, y: 1, z: 7 }));
    const manager = new SpawnManager(world, visibility, makeContent(), config);

    manager.tick(1_000);

    expect(manager.activeCreatureId("monster:slot-1")).not.toBeNull();
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

  it("bulk-spawns and removes a four-digit dev performance fixture", () => {
    const world = new World(
      gridMapData({ name: "test", width: 80, height: 80, blocked: [] }),
      25,
    );
    world.addPlayer(
      new Player(makeCharacter("viewer"), { x: 40, y: 40, z: 7 }),
    );
    const manager = new SpawnManager(
      world,
      visibility,
      makeContent(false),
      {
        ...config,
        activationRange: { x: 32, y: 24 },
        maxAiScansPerTick: 1_000,
        maxAiWorkPerTick: 1_000,
      },
    );

    expect(
      manager.spawnMonstersNear(
        monsterType.id,
        { x: 40, y: 40, z: 7 },
        1_000,
        1_000,
      ),
    ).toBe(1_000);
    expect(
      [...world.allCreatures()].filter(
        (creature) => creature.kind === "monster",
      ),
    ).toHaveLength(1_000);

    expect(manager.removeGmMonsters()).toBe(1_000);
    expect(
      [...world.allCreatures()].filter(
        (creature) => creature.kind === "monster",
      ),
    ).toHaveLength(0);
  });

  it("caps player summons, refuses unsummonable types, and releases them", () => {
    const summonable: MonsterType = {
      ...monsterType,
      flags: { ...monsterType.flags, summonable: true },
    };
    const forbidden: MonsterType = {
      ...monsterType,
      id: "dragon",
      name: "Dragon",
      flags: { ...monsterType.flags, summonable: false },
    };
    const world = makeWorld();
    const owner = world.getPlayer("viewer");
    if (!owner) throw new Error("expected the seeded player");
    const manager = new SpawnManager(
      world,
      visibility,
      {
        monsterTypes: new Map([
          [summonable.id, summonable],
          [forbidden.id, forbidden],
        ]),
        npcTypes: new Map(),
        shopCatalogs: new Map(),
        slots: [],
      },
      config,
    );

    // Names are resolved against the catalog, never used to index anything.
    expect(manager.findMonsterTypeByName("  rAt ")?.id).toBe(summonable.id);
    expect(manager.findMonsterTypeByName("no such monster")).toBeUndefined();

    // An unsummonable type is refused even though it exists.
    expect(manager.summonForPlayer(owner, forbidden.id, 1_000)).toBeNull();

    expect(manager.summonForPlayer(owner, summonable.id, 1_000)).not.toBeNull();
    expect(manager.summonForPlayer(owner, summonable.id, 1_001)).not.toBeNull();
    // Third summon breaches the shared cap and must be refused.
    expect(manager.summonForPlayer(owner, summonable.id, 1_002)).toBeNull();
    expect(manager.playerSummonCount(owner.id)).toBe(2);

    manager.releaseSummonsOf(owner.id);
    expect(manager.playerSummonCount(owner.id)).toBe(0);
    expect(
      [...world.allCreatures()].filter(
        (creature) => creature.kind === "monster",
      ),
    ).toHaveLength(0);
  });

  it("never lets a challenge redirect a summon or an unacquirable target", () => {
    const summonable: MonsterType = {
      ...monsterType,
      flags: { ...monsterType.flags, summonable: true, hostile: true },
    };
    const world = makeWorld();
    const owner = world.getPlayer("viewer");
    if (!owner) throw new Error("expected the seeded player");
    const manager = new SpawnManager(
      world,
      visibility,
      {
        monsterTypes: new Map([[summonable.id, summonable]]),
        npcTypes: new Map(),
        shopCatalogs: new Map(),
        slots: [
          {
            id: "monster:slot-1",
            kind: "monster",
            typeId: summonable.id,
            home: { x: 2, y: 1, z: 7 },
            radius: 1,
            respawnMs: 1_000,
            direction: "south",
            enabled: true,
          },
        ],
      },
      config,
    );
    manager.tick(1_000);
    const wildId = manager.activeCreatureId("monster:slot-1");
    if (!wildId) throw new Error("expected the wild monster");
    const wild = world.getCreature(wildId) as Monster;

    const summon = manager.summonForPlayer(owner, summonable.id, 1_000);
    if (!summon) throw new Error("expected a summon");

    // Canary refuses to challenge an owned creature.
    expect(manager.challengeMonster(summon, owner, 1_000, 12_000)).toBe(false);
    expect(manager.pullMonsterToMelee(summon, 1, 1_000, 12_000)).toBe(false);

    expect(manager.challengeMonster(wild, owner, 1_000, 12_000)).toBe(true);
    // A melee monster is already at distance 1, so the pull is a no-op.
    expect(manager.pullMonsterToMelee(wild, 1, 1_000, 12_000)).toBe(false);

    // A monster that is no longer the live instance can never be challenged.
    world.removeCreature(wild.id);
    expect(manager.challengeMonster(wild, owner, 1_100, 12_000)).toBe(false);
  });

  it("never lets a reward boss be challenged or melee-pulled (Feature 76)", () => {
    const rewardBoss: MonsterType = {
      ...monsterType,
      flags: {
        ...monsterType.flags,
        hostile: true,
        rewardBoss: true,
        targetDistance: 4,
      },
    };
    const world = makeWorld();
    const owner = world.getPlayer("viewer");
    if (!owner) throw new Error("expected the seeded player");
    const manager = new SpawnManager(
      world,
      visibility,
      {
        monsterTypes: new Map([[rewardBoss.id, rewardBoss]]),
        npcTypes: new Map(),
        shopCatalogs: new Map(),
        slots: [
          {
            id: "monster:slot-1",
            kind: "monster",
            typeId: rewardBoss.id,
            home: { x: 2, y: 1, z: 7 },
            radius: 1,
            respawnMs: 1_000,
            direction: "south",
            enabled: true,
          },
        ],
      },
      config,
    );
    manager.tick(1_000);
    const bossId = manager.activeCreatureId("monster:slot-1");
    if (!bossId) throw new Error("expected the reward boss");
    const boss = world.getCreature(bossId) as Monster;

    expect(manager.challengeMonster(boss, owner, 1_000, 12_000)).toBe(false);
    expect(manager.pullMonsterToMelee(boss, 1, 1_000, 12_000)).toBe(false);
  });

  it("never spawns a monster on a protection-zone home, but still spawns NPCs", () => {
    // A handful of imported spawn points sit inside town protection zones,
    // where Canary's Tile::queryAdd refuses a monster outright (tile.cpp).
    const world = makeProtectionZoneWorld();
    const npcType = makeNpcType({ id: "banker", walkRadius: 0 });
    const manager = new SpawnManager(
      world,
      visibility,
      {
        monsterTypes: new Map([[monsterType.id, monsterType]]),
        npcTypes: new Map([[npcType.id, npcType]]),
        shopCatalogs: new Map(),
        slots: [
          {
            id: "monster:slot-1",
            kind: "monster",
            typeId: monsterType.id,
            home: { x: 3, y: 3, z: 7 },
            radius: 0,
            respawnMs: 1_000,
            direction: "south",
            enabled: true,
          },
          {
            id: "npc:slot-1",
            kind: "npc",
            typeId: npcType.id,
            home: { x: 4, y: 3, z: 7 },
            radius: 0,
            respawnMs: 1_000,
            direction: "south",
            enabled: true,
          },
        ],
      },
      config,
    );

    manager.tick(1_000);
    manager.tick(2_000);
    manager.tick(60_000);

    expect(manager.protectionZoneSlots).toBe(1);
    expect(manager.activeCreatureId("monster:slot-1")).toBeNull();
    expect(manager.activeCreatureId("npc:slot-1")).not.toBeNull();
    expect(
      [...world.allCreatures()].filter(
        (creature) => creature.kind === "monster",
      ),
    ).toHaveLength(0);
  });

  it("refuses ad-hoc and player summons inside a protection zone", () => {
    const world = makeProtectionZoneWorld();
    const summonable: MonsterType = {
      ...monsterType,
      flags: { ...monsterType.flags, summonable: true },
    };
    const owner = world.getPlayer("viewer");
    if (!owner) throw new Error("expected the seeded player");
    world.relocateCreature(owner, { x: 3, y: 3, z: 7 });
    const manager = new SpawnManager(
      world,
      visibility,
      {
        monsterTypes: new Map([[summonable.id, summonable]]),
        npcTypes: new Map(),
        shopCatalogs: new Map(),
        slots: [],
      },
      config,
    );

    // Every tile within reach of the temple is a protection zone.
    expect(
      manager.spawnMonsterNear(summonable.id, { x: 3, y: 3, z: 7 }, 1_000),
    ).toBe("no-space");
    expect(manager.summonForPlayer(owner, summonable.id, 1_000)).toBeNull();
    expect(
      manager.spawnEventMonsterNear(summonable.id, { x: 3, y: 3, z: 7 }, 1_000),
    ).toBeNull();
    expect(
      [...world.allCreatures()].filter(
        (creature) => creature.kind === "monster",
      ),
    ).toHaveLength(0);

    // Outside the zone the same calls place normally.
    world.relocateCreature(owner, { x: 10, y: 10, z: 7 });
    expect(manager.summonForPlayer(owner, summonable.id, 1_100)).not.toBeNull();
  });
});
