import { describe, expect, it } from "vitest";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { selectAutoTarget } from "./selectAutoTarget";

const monsterType: MonsterType = {
  id: "rat",
  name: "Rat",
  description: "a rat",
  outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
  health: 100,
  maxHealth: 100,
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

function makeWorld() {
  return new World(
    gridMapData({
      name: "test",
      width: 40,
      height: 40,
      blocked: [],
      protectionZones: [[30, 30, 7]],
    }),
    180,
  );
}

function addMonster(
  world: World,
  id: string,
  x: number,
  y: number,
  options: {
    health?: number;
    healthHidden?: boolean;
    attackable?: boolean;
    z?: number;
  } = {},
): Monster {
  const type: MonsterType = {
    ...monsterType,
    flags: {
      ...monsterType.flags,
      healthHidden: options.healthHidden ?? false,
      attackable: options.attackable ?? true,
    },
  };
  const position = { x, y, z: options.z ?? 7 };
  const monster = new Monster({
    id,
    type,
    position,
    direction: "south",
    home: position,
    spawnRadius: 2,
  });
  if (options.health !== undefined) monster.setHealth(options.health);
  world.addCreature(monster);
  return monster;
}

function makeSession(knownIds: ReadonlyArray<string>): Session {
  return {
    playerId: "char-1",
    knownCreatureIds: new Set(knownIds),
    viewRange: { x: 8, y: 6 },
    fightMode: { chase: false, secure: true, stance: "balanced" },
  } as unknown as Session;
}

function addPlayer(world: World, x = 10, y = 10, z = 7): Player {
  const player = new Player(makeCharacter("char-1", "Tester"), { x, y, z });
  world.addPlayer(player);
  return player;
}

const never = () => false;

describe("selectAutoTarget", () => {
  it("prefers the weakest monster over the nearest one", () => {
    const world = makeWorld();
    const player = addPlayer(world);
    addMonster(world, "close-healthy", 11, 10);
    addMonster(world, "far-wounded", 14, 10, { health: 20 });
    const session = makeSession(["close-healthy", "far-wounded"]);

    const target = selectAutoTarget({ world, session, player, isSummon: never });

    expect(target?.id).toBe("far-wounded");
  });

  it("breaks a health tie with distance, then deterministically by id", () => {
    const world = makeWorld();
    const player = addPlayer(world);
    addMonster(world, "b-far", 13, 10);
    addMonster(world, "a-near", 11, 10);
    addMonster(world, "b-near", 10, 11);
    const session = makeSession(["b-far", "a-near", "b-near"]);

    const target = selectAutoTarget({ world, session, player, isSummon: never });

    expect(target?.id).toBe("a-near");
  });

  it("ranks a health-hidden monster as untouched so its health never leaks", () => {
    const world = makeWorld();
    const player = addPlayer(world);
    addMonster(world, "hidden-and-dying", 11, 10, {
      health: 1,
      healthHidden: true,
    });
    addMonster(world, "plain-wounded", 12, 10, { health: 50 });
    const session = makeSession(["hidden-and-dying", "plain-wounded"]);

    const target = selectAutoTarget({ world, session, player, isSummon: never });

    expect(target?.id).toBe("plain-wounded");
  });

  it("ignores monsters the session was never introduced to", () => {
    const world = makeWorld();
    const player = addPlayer(world);
    addMonster(world, "unseen", 11, 10, { health: 5 });
    addMonster(world, "seen", 12, 10);
    const session = makeSession(["seen"]);

    const target = selectAutoTarget({ world, session, player, isSummon: never });

    expect(target?.id).toBe("seen");
  });

  it("ignores dead, unattackable and summoned monsters", () => {
    const world = makeWorld();
    const player = addPlayer(world);
    const dead = addMonster(world, "dead", 11, 10);
    dead.setHealth(0);
    addMonster(world, "peaceful", 11, 11, { attackable: false });
    addMonster(world, "pet", 11, 12, { health: 1 });
    const session = makeSession(["dead", "peaceful", "pet"]);

    const target = selectAutoTarget({
      world,
      session,
      player,
      isSummon: (monster) => monster.id === "pet",
    });

    expect(target).toBeNull();
  });

  it("targets nothing while the player stands in a protection zone", () => {
    const world = makeWorld();
    const player = addPlayer(world, 30, 30);
    addMonster(world, "outside", 31, 30);
    const session = makeSession(["outside"]);

    const target = selectAutoTarget({ world, session, player, isSummon: never });

    expect(target).toBeNull();
  });

  it("ignores monsters on another floor", () => {
    const world = makeWorld();
    const player = addPlayer(world);
    addMonster(world, "below", 11, 10, { z: 8, health: 1 });
    const session = makeSession(["below"]);

    const target = selectAutoTarget({ world, session, player, isSummon: never });

    expect(target).toBeNull();
  });
});
