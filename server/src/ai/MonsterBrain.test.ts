import { describe, expect, it, vi } from "vitest";
import type { Combat } from "../combat/Combat";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { MonsterBrain } from "./MonsterBrain";

const baseType: MonsterType = {
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
  defenses: [],
  elements: {},
  immunities: [],
  maxSummons: 0,
  summons: [],
  voices: [],
  loot: [],
};

const config = {
  thinkIntervalMs: 100,
  acquisitionRange: 8,
  loseRange: 12,
  despawnRadius: 50,
  maxPathNodes: 32,
  wanderChance: 1,
};

const makeWorld = (
  blocked: ReadonlyArray<readonly [number, number]> = [],
  floors: ReadonlyArray<number> = [7],
) =>
  new World(
    gridMapData({ name: "test", width: 8, height: 8, blocked, floors }),
    25,
  );

const makeMonster = (
  type: MonsterType = baseType,
  radius = 3,
) =>
  new Monster({
    id: "monster-instance:test:0",
    type,
    position: { x: 2, y: 2, z: 7 },
    direction: "south",
    home: { x: 2, y: 2, z: 7 },
    spawnRadius: radius,
  });

describe("MonsterBrain", () => {
  it("acquires a visible player and chases without entering a blocked tile", () => {
    const world = makeWorld([[3, 2]]);
    const monster = makeMonster();
    const player = new Player(makeCharacter("target"), { x: 4, y: 2, z: 7 });
    world.addCreature(monster);
    world.addPlayer(player);
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 1_000, 32);

    expect(brain.targetCreatureId).toBe(player.id);
    expect(brain.state).toBe("chase");
    expect(monster.position).not.toEqual({ x: 3, y: 2, z: 7 });
    expect(world.isPathable(monster.position)).toBe(true);
  });

  it("acquires and chases a player far outside a tight spawn radius", () => {
    const world = makeWorld();
    const monster = makeMonster(baseType, 1);
    const player = new Player(makeCharacter("far"), { x: 6, y: 2, z: 7 });
    world.addCreature(monster);
    world.addPlayer(player);
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 1_000, 32);
    expect(brain.targetCreatureId).toBe(player.id);
    expect(brain.state).toBe("chase");

    for (let now = 2_000; now <= 30_000; now += 500) {
      brain.tick(world, now, 32);
    }
    expect(
      Math.max(
        Math.abs(monster.position.x - player.position.x),
        Math.abs(monster.position.y - player.position.y),
      ),
    ).toBe(1);
    expect(
      Math.max(
        Math.abs(monster.position.x - monster.home.x),
        Math.abs(monster.position.y - monster.home.y),
      ),
    ).toBeGreaterThan(monster.spawnRadius);
  });

  it("does not acquire or chase a player beyond the despawn radius", () => {
    const world = makeWorld();
    const monster = makeMonster(baseType, 1);
    const player = new Player(makeCharacter("far"), { x: 6, y: 2, z: 7 });
    world.addCreature(monster);
    world.addPlayer(player);
    const brain = new MonsterBrain(monster, 0, 7, {
      ...config,
      despawnRadius: 2,
    });

    for (let now = 1_000; now <= 10_000; now += 500) {
      brain.tick(world, now, 32);
      expect(brain.targetCreatureId).toBeNull();
      expect(
        Math.max(
          Math.abs(monster.position.x - monster.home.x),
          Math.abs(monster.position.y - monster.home.y),
        ),
      ).toBeLessThanOrEqual(2);
    }
  });

  it("does not acquire or cross onto a player's different floor", () => {
    const world = makeWorld([], [7, 8]);
    const monster = makeMonster();
    world.addCreature(monster);
    world.addPlayer(
      new Player(makeCharacter("upper"), { x: 3, y: 2, z: 8 }),
    );
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 1_000, 32);

    expect(brain.targetCreatureId).toBeNull();
    expect(monster.position.z).toBe(7);
  });

  it("only sees invisible players when Canary grants invisibility immunity", () => {
    const hidden = new Player(makeCharacter("hidden"), { x: 3, y: 2, z: 7 });
    hidden.applyCondition("invisible");

    const ordinaryWorld = makeWorld();
    const ordinary = makeMonster();
    ordinaryWorld.addCreature(ordinary);
    ordinaryWorld.addPlayer(hidden);
    const ordinaryBrain = new MonsterBrain(ordinary, 0, 7, config);

    ordinaryBrain.tick(ordinaryWorld, 1_000, 32);
    expect(ordinaryBrain.targetCreatureId).toBeNull();

    const immuneWorld = makeWorld();
    const immune = makeMonster({
      ...baseType,
      immunities: ["invisible"],
    });
    immuneWorld.addCreature(immune);
    immuneWorld.addPlayer(hidden);
    const immuneBrain = new MonsterBrain(immune, 0, 7, config);

    immuneBrain.tick(immuneWorld, 1_000, 32);
    expect(immuneBrain.targetCreatureId).toBe(hidden.id);
  });

  it("keeps deterministic random walking inside its home leash", () => {
    const passiveType: MonsterType = {
      ...baseType,
      flags: { ...baseType.flags, hostile: false },
    };
    const world = makeWorld();
    const monster = makeMonster(passiveType, 1);
    world.addCreature(monster);
    const brain = new MonsterBrain(monster, 0, 1234, config);

    for (let now = 1_000; now <= 20_000; now += 1_000) {
      brain.tick(world, now, 32);
      expect(monster.position.z).toBe(monster.home.z);
      expect(
        Math.max(
          Math.abs(monster.position.x - monster.home.x),
          Math.abs(monster.position.y - monster.home.y),
        ),
      ).toBeLessThanOrEqual(1);
    }
  });

  it("never consumes more than the work granted by the tick", () => {
    const world = makeWorld([[3, 2], [2, 1], [2, 3], [1, 2]]);
    const monster = makeMonster();
    world.addCreature(monster);
    world.addPlayer(
      new Player(makeCharacter("target"), { x: 4, y: 2, z: 7 }),
    );
    const brain = new MonsterBrain(monster, 0, 7, config);

    const result = brain.tick(world, 1_000, 2);

    expect(result.work).toBeLessThanOrEqual(2);
    expect(monster.position).toEqual({ x: 2, y: 2, z: 7 });
  });

  it("schedules attacks and summons inside the granted AI budget", () => {
    const attack = {
      kind: "damage",
      intervalMs: 100,
      chance: 100,
      target: "target",
      range: 4,
      area: { shape: "single" },
      damageType: "physical",
      minimum: 1,
      maximum: 1,
    } as const;
    const summon = {
      typeId: "rat",
      intervalMs: 100,
      chance: 100,
      maxCount: 2,
    } as const;
    const type: MonsterType = {
      ...baseType,
      attacks: [attack],
      summons: [summon],
    };
    const world = makeWorld();
    const monster = makeMonster(type);
    const player = new Player(makeCharacter("target"), { x: 3, y: 2, z: 7 });
    const executeMonsterAbility = vi.fn(() => true);
    const summonMonster = vi.fn(() => true);
    world.addCreature(monster);
    world.addPlayer(player);
    const brain = new MonsterBrain(monster, 0, 7, config, {
      combat: { executeMonsterAbility } as unknown as Combat,
      summon: summonMonster,
    });

    const result = brain.tick(world, 1_000, 3);

    expect(result.work).toBeLessThanOrEqual(3);
    expect(executeMonsterAbility).toHaveBeenCalledWith(
      monster,
      player,
      attack,
      1_000,
    );
    expect(summonMonster).toHaveBeenCalledWith(monster, "rat", 2, 1_000);
  });

  it("speaks a Canary monster voice on its configured interval", () => {
    const type: MonsterType = {
      ...baseType,
      speed: 0,
      flags: { ...baseType.flags, hostile: false },
      voices: [
        {
          intervalMs: 100,
          chance: 100,
          text: "GROOAAARRR",
          yell: true,
        },
      ],
    };
    const world = makeWorld();
    const monster = makeMonster(type);
    const speak = vi.fn();
    world.addCreature(monster);
    const brain = new MonsterBrain(monster, 0, 7, config, { speak });

    brain.tick(world, 100, 32);

    expect(speak).toHaveBeenCalledWith(monster, "GROOAAARRR", true);
  });

  it("acquires the nearest target and flees from it at low health", () => {
    const type: MonsterType = {
      ...baseType,
      flags: { ...baseType.flags, runHealth: 5 },
    };
    const world = makeWorld();
    const monster = makeMonster(type);
    const nearby = new Player(makeCharacter("nearby"), { x: 3, y: 2, z: 7 });
    const farther = new Player(makeCharacter("farther"), { x: 4, y: 2, z: 7 });
    monster.setHealth(5);
    world.addCreature(monster);
    world.addPlayer(nearby);
    world.addPlayer(farther);
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 1_000, 32);

    expect(brain.targetCreatureId).toBe(nearby.id);
    expect(brain.state).toBe("flee");
    expect(
      Math.max(
        Math.abs(monster.position.x - nearby.position.x),
        Math.abs(monster.position.y - nearby.position.y),
      ),
    ).toBeGreaterThanOrEqual(2);
  });

  it("uses Dragon's run-health value as hit points instead of a percentage", () => {
    const type: MonsterType = {
      ...baseType,
      id: "dragon",
      name: "Dragon",
      description: "a dragon",
      health: 1_000,
      maxHealth: 1_000,
      flags: { ...baseType.flags, runHealth: 300 },
    };
    const world = makeWorld();
    const monster = makeMonster(type);
    const player = new Player(makeCharacter("target"), { x: 6, y: 2, z: 7 });
    world.addCreature(monster);
    world.addPlayer(player);
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 1_000, 32);

    expect(brain.targetCreatureId).toBe(player.id);
    expect(brain.state).toBe("chase");

    monster.setHealth(300);
    brain.tick(world, 10_000, 32);

    expect(brain.state).toBe("flee");
  });

  it("does not move a speed-zero monster while it is fleeing", () => {
    const type: MonsterType = {
      ...baseType,
      speed: 0,
      flags: { ...baseType.flags, runHealth: baseType.health },
    };
    const world = makeWorld();
    const monster = makeMonster(type);
    const player = new Player(makeCharacter("target"), { x: 3, y: 2, z: 7 });
    world.addCreature(monster);
    world.addPlayer(player);
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 1_000, 32);

    expect(brain.state).toBe("flee");
    expect(monster.position).toEqual(monster.home);
  });

  it("lets a Dragon-like melee-distance monster retarget a farther player", () => {
    const type: MonsterType = {
      ...baseType,
      speed: 0,
      changeTarget: { intervalMs: 250, chance: 100 },
      flags: { ...baseType.flags, staticAttackChance: 100 },
      targetStrategy: { nearest: 100, health: 0, damage: 0, random: 0 },
    };
    const world = makeWorld();
    const monster = makeMonster(type);
    const nearby = new Player(makeCharacter("nearby"), { x: 3, y: 2, z: 7 });
    const farther = new Player(makeCharacter("farther"), { x: 6, y: 2, z: 7 });
    world.addCreature(monster);
    world.addPlayer(nearby);
    world.addPlayer(farther);
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 100, 32);
    expect(brain.targetCreatureId).toBe(nearby.id);

    brain.tick(world, 1_000, 32);

    expect(brain.targetCreatureId).toBe(farther.id);
  });

  it("keeps ranged-distance target changes focused on the nearest player", () => {
    const type: MonsterType = {
      ...baseType,
      speed: 0,
      changeTarget: { intervalMs: 250, chance: 100 },
      flags: { ...baseType.flags, targetDistance: 4 },
    };
    const world = makeWorld();
    const monster = makeMonster(type);
    const nearby = new Player(makeCharacter("nearby"), { x: 3, y: 2, z: 7 });
    const farther = new Player(makeCharacter("farther"), { x: 6, y: 2, z: 7 });
    world.addCreature(monster);
    world.addPlayer(nearby);
    world.addPlayer(farther);
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 100, 32);
    brain.tick(world, 1_000, 32);

    expect(brain.targetCreatureId).toBe(nearby.id);
  });

  it("keeps the current target when Canary's change-target roll is zero", () => {
    const type: MonsterType = {
      ...baseType,
      speed: 0,
      changeTarget: { intervalMs: 250, chance: 0 },
      targetStrategy: { nearest: 1, health: 0, damage: 100, random: 0 },
    };
    const world = makeWorld();
    const monster = makeMonster(type);
    const first = new Player(makeCharacter("first"), { x: 3, y: 2, z: 7 });
    world.addCreature(monster);
    world.addPlayer(first);
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 100, 32);
    expect(brain.targetCreatureId).toBe(first.id);

    const damager = new Player(makeCharacter("damager"), {
      x: 4,
      y: 2,
      z: 7,
    });
    monster.recordPlayerDamage(damager.id, 10);
    world.addPlayer(damager);
    brain.tick(world, 1_000, 32);

    expect(brain.targetCreatureId).toBe(first.id);
  });

  it("does not retarget when Canary's change-target interval is disabled", () => {
    const type: MonsterType = {
      ...baseType,
      speed: 0,
      changeTarget: { intervalMs: 0, chance: 100 },
    };
    const world = makeWorld();
    const monster = makeMonster(type);
    const first = new Player(makeCharacter("first"), { x: 3, y: 2, z: 7 });
    const second = new Player(makeCharacter("second"), { x: 4, y: 2, z: 7 });
    world.addCreature(monster);
    world.addPlayer(first);
    world.addPlayer(second);
    const brain = new MonsterBrain(monster, 0, 7, config);

    brain.tick(world, 100, 32);
    brain.tick(world, 1_000, 32);

    expect(brain.targetCreatureId).toBe(first.id);
  });
});
