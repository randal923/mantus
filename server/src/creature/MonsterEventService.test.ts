import { describe, expect, it, vi } from "vitest";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { MapData } from "../MapData";
import { Player } from "../Player";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { MonsterType } from "./MonsterType";
import { Monster } from "./Monster";
import { MonsterEventService } from "./MonsterEventService";

const map: MapData = {
  name: "monster-event-test",
  spawn: { x: 33_990, y: 31_090, z: 9 },
  getTile: () => ({
    walkable: true,
    pathable: true,
    groundSpeed: 150,
    blocksProjectile: false,
    limitsFloorView: true,
    limitsFloorViewFree: true,
    protectionZone: false,
    noPvpZone: false,
    noLogoutZone: false,
    pvpZone: false,
  }),
  isWalkable: () => true,
  getGroundSpeed: () => 150,
  blocksProjectile: () => false,
  getTransition: () => undefined,
  getAction: () => undefined,
  getItems: () => [],
};

function monsterType(
  id: string,
  callbacks: MonsterType["callbacks"],
  events: ReadonlyArray<string> = [],
): MonsterType {
  return {
    id,
    name: id.split("-").map((part) =>
      part.length > 0 ? part[0]?.toUpperCase() + part.slice(1) : part
    ).join(" "),
    description: id,
    outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    health: 100,
    maxHealth: 100,
    speed: 100,
    manaCost: 0,
    changeTarget: { intervalMs: 4_000, chance: 0 },
    light: { intensity: 0, color: 0 },
    experience: 0,
    corpseItemTypeId: 0,
    race: "blood",
    faction: "default",
    enemyFactions: [],
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
      runHealth: 0,
      staticAttackChance: 95,
      healthHidden: false,
      canWalkOnEnergy: true,
      canWalkOnFire: true,
      canWalkOnPoison: true,
      isBlockable: true,
    },
    targetStrategy: { nearest: 100, health: 0, damage: 0, random: 0 },
    attacks: [],
    defenses: [],
    elements: {},
    immunities: [],
    reflects: {},
    heals: {},
    events,
    callbacks,
    maxSummons: 0,
    summons: [],
    voices: [],
    loot: [],
  };
}

function monster(id: string, type: MonsterType): Monster {
  return new Monster({
    id,
    type,
    position: { x: 33_990, y: 31_090, z: 9 },
    direction: "south",
    home: { x: 33_990, y: 31_090, z: 9 },
    spawnRadius: 3,
  });
}

function serviceHarness(seed = 1) {
  const world = new World(map, 25);
  const registry = new SessionRegistry();
  const persistence = {
    markDirty: vi.fn(),
  } as unknown as CharacterPersistence;
  const items = {
    removeWorldItem: vi.fn(),
    removeFirstWorldItemByTypeIds: vi.fn(),
    createEventWorldItem: vi.fn(),
    transformEquippedItemForEvent: vi.fn(),
  } as unknown as ItemIntentHandler;
  const transformMonster = vi.fn(() => true);
  const service = new MonsterEventService(
    world,
    persistence,
    new Visibility(world, registry),
    registry,
    items,
    seed,
    () => null,
    () => undefined,
    transformMonster,
  );
  return { world, persistence, service, transformMonster };
}

describe("MonsterEventService", () => {
  it("runs the pinned Lesser Splinter delayed transformation on the tick", () => {
    const harness = serviceHarness();
    const splinter = monster(
      "monster:lesser",
      monsterType("lesser-splinter-of-madness", ["onSpawn"]),
    );
    harness.world.addCreature(splinter);

    harness.service.onMonsterSpawn(splinter, 1_000);
    harness.service.tick(120_999);
    expect(harness.transformMonster).not.toHaveBeenCalled();

    harness.service.tick(121_000);
    expect(harness.transformMonster).toHaveBeenCalledWith(
      splinter.id,
      "greater-splinter-of-madness",
      121_000,
    );
  });

  it("replaces a Mirror Image with the first attacker's vocation apparition", () => {
    const harness = serviceHarness(1);
    const mirror = monster(
      "monster:mirror",
      monsterType("mirror-image", ["onPlayerAttack"]),
    );
    const attacker = new Player(
      makeCharacter("00000000-0000-4000-8000-000000000011", "Knight"),
      { x: 33_991, y: 31_090, z: 9 },
    );
    harness.world.addCreature(mirror);
    harness.world.addPlayer(attacker);

    harness.service.onPlayerAttackMonster(mirror, attacker, 1_000);

    expect(harness.transformMonster).toHaveBeenCalledWith(
      mirror.id,
      "knight-s-apparition",
      1_000,
    );
  });

  it("teleports Soul War monsters to the captured farthest-player tile", () => {
    const harness = serviceHarness(1);
    const terror = monster(
      "monster:terror",
      monsterType("cloak-of-terror", ["onThink"]),
    );
    const player = new Player(
      makeCharacter("00000000-0000-4000-8000-000000000012", "Target"),
      { x: 34_020, y: 31_090, z: 9 },
    );
    harness.world.addCreature(terror);
    harness.world.addPlayer(player);

    harness.service.onMonsterThink(terror, 1_000);
    harness.service.tick(2_999);
    expect(terror.position).toEqual({ x: 33_990, y: 31_090, z: 9 });

    harness.service.tick(3_000);
    expect(terror.position).toEqual(player.position);
  });

  it("persists apparition kill credit for every player in the damage map", () => {
    const harness = serviceHarness();
    const apparition = monster(
      "monster:apparition",
      {
        ...monsterType(
          "knight-s-apparition",
          [],
          ["MirroredNightmareBossAccess"],
        ),
        name: "Knight's Apparition",
      },
    );
    const player = new Player(
      makeCharacter("00000000-0000-4000-8000-000000000013", "Damager"),
      { x: 33_991, y: 31_090, z: 9 },
    );
    harness.world.addCreature(apparition);
    harness.world.addPlayer(player);

    harness.service.onMonsterDeath(apparition, [player.id], player.id, 1_000);

    expect(
      player.storageValue("SoulWar.mirrored-nightmare.Knight's Apparition"),
    ).toBe(1);
    expect(harness.persistence.markDirty).toHaveBeenCalledWith(player);
  });
});
