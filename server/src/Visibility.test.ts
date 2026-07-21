import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { Monster } from "./creature/Monster";
import type { MonsterType } from "./creature/MonsterType";
import { gridMapData } from "./gridMapData";
import { Player } from "./Player";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import { makeCharacter } from "./test/makeCharacter";
import { Visibility } from "./Visibility";
import { World } from "./World";

const monsterType: MonsterType = {
  id: "rat",
  name: "Rat",
  description: "a rat",
  outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
  health: 13,
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

const makeMonster = (id: string, x: number, y: number, z: number) =>
  new Monster({
    id,
    type: monsterType,
    position: { x, y, z },
    direction: "south",
    home: { x, y, z },
    spawnRadius: 2,
  });

describe("Visibility creature projections", () => {
  it("projects pinned static monster light without exact private stats", () => {
    const monster = new Monster({
      id: "lit",
      type: {
        ...monsterType,
        light: { intensity: 7, color: 215 },
      },
      position: { x: 2, y: 2, z: 7 },
      direction: "south",
      home: { x: 2, y: 2, z: 7 },
      spawnRadius: 2,
    });

    expect(monster.toState()).toMatchObject({
      light: { intensity: 7, color: 215 },
      healthPercent: 65,
    });
    expect(monster.toState()).not.toHaveProperty("health");
  });

  it("does not project health for a health-hidden monster", () => {
    const monster = new Monster({
      id: "hidden-health",
      type: {
        ...monsterType,
        flags: { ...monsterType.flags, healthHidden: true },
      },
      position: { x: 2, y: 2, z: 7 },
      direction: "south",
      home: { x: 2, y: 2, z: 7 },
      spawnRadius: 2,
    });

    expect(monster.toState().healthPercent).toBeNull();
  });

  it("omits far and wrong-floor creatures and exposes only health percentage", () => {
    const world = new World(
      gridMapData({
        name: "test",
        width: 12,
        height: 12,
        blocked: [],
        floors: [7, 8],
      }),
      25,
    );
    const viewer = new Player(makeCharacter("viewer"), { x: 5, y: 5, z: 7 });
    const visible = makeMonster("monster-instance:visible:0", 6, 5, 7);
    const wrongFloor = makeMonster("monster-instance:upper:0", 6, 5, 8);
    const far = makeMonster("monster-instance:far:0", 10, 10, 7);
    world.addPlayer(viewer);
    world.addCreature(visible);
    world.addCreature(wrongFloor);
    world.addCreature(far);
    const sent: ServerMessage[] = [];
    const session = {
      id: "session",
      playerId: viewer.id,
      viewRange: { x: 2, y: 2 },
      knownCreatureIds: new Set<string>(),
      knownMapItemTiles: new Map(),
      attackTargetId: null,
      send: (message: ServerMessage) => sent.push(message),
    } as unknown as Session;
    const registry = {
      sessionFor: (playerId: string) =>
        playerId === viewer.id ? session : undefined,
      all: () => [session],
    } as unknown as SessionRegistry;
    const visibility = new Visibility(world, registry);

    const states = visibility.announceSpawn(session, viewer);

    expect(states.map((state) => state.id).sort()).toEqual(
      [viewer.id, visible.id].sort(),
    );
    const monsterState = states.find((state) => state.id === visible.id);
    expect(monsterState).toMatchObject({ kind: "monster", healthPercent: 65 });
    expect(monsterState).not.toHaveProperty("health");
    expect(session.knownCreatureIds.has(wrongFloor.id)).toBe(false);
    expect(session.knownCreatureIds.has(far.id)).toBe(false);

    visibility.announceCreatureSpawn(wrongFloor);
    expect(sent).toEqual([]);
  });

  it("clears a target before forgetting a creature that leaves view", () => {
    const world = new World(
      gridMapData({
        name: "test",
        width: 12,
        height: 12,
        blocked: [],
      }),
      25,
    );
    const viewer = new Player(makeCharacter("viewer"), { x: 5, y: 5, z: 7 });
    const visible = makeMonster("monster-instance:visible:0", 6, 5, 7);
    world.addPlayer(viewer);
    world.addCreature(visible);
    const sent: ServerMessage[] = [];
    const session = {
      id: "session",
      playerId: viewer.id,
      viewRange: { x: 2, y: 2 },
      knownCreatureIds: new Set<string>(),
      knownMapItemTiles: new Map(),
      attackTargetId: null,
      send: (message: ServerMessage) => sent.push(message),
    } as unknown as Session;
    const registry = {
      sessionFor: (playerId: string) =>
        playerId === viewer.id ? session : undefined,
      all: () => [session],
    } as unknown as SessionRegistry;
    const visibility = new Visibility(world, registry);
    visibility.announceSpawn(session, viewer);
    session.attackTargetId = visible.id;

    visibility.announceCreatureLeave(visible);

    expect(session.attackTargetId).toBeNull();
    expect(sent).toEqual([
      { type: "attack-target-changed", creatureId: null },
      { type: "creature-left", creatureId: visible.id },
    ]);
  });

  it("does not reveal combat events for unknown, invisible, or wrong-floor creatures", () => {
    const world = new World(
      gridMapData({
        name: "test",
        width: 12,
        height: 12,
        blocked: [],
        floors: [7, 8],
      }),
      25,
    );
    const viewer = new Player(makeCharacter("viewer"), { x: 5, y: 5, z: 7 });
    const visible = makeMonster("monster-instance:visible:0", 6, 5, 7);
    const hidden = makeMonster("monster-instance:hidden:0", 7, 5, 7);
    const wrongFloor = makeMonster("monster-instance:upper:0", 6, 5, 8);
    hidden.conditions.apply(
      { type: "invisible", sourceId: hidden.id, durationMs: 5_000 },
      0,
    );
    world.addPlayer(viewer);
    world.addCreature(visible);
    world.addCreature(hidden);
    world.addCreature(wrongFloor);
    const sent: ServerMessage[] = [];
    const session = {
      id: "session",
      playerId: viewer.id,
      viewRange: { x: 4, y: 4 },
      knownCreatureIds: new Set<string>(),
      knownMapItemTiles: new Map(),
      attackTargetId: null,
      send: (message: ServerMessage) => sent.push(message),
    } as unknown as Session;
    const registry = {
      sessionFor: (playerId: string) =>
        playerId === viewer.id ? session : undefined,
      all: () => [session],
    } as unknown as SessionRegistry;
    const visibility = new Visibility(world, registry);
    visibility.announceSpawn(session, viewer);

    visibility.broadcastCombatText(visible, 5, "physical", "none");
    visibility.broadcastCombatText(hidden, 5, "physical", "none");
    visibility.broadcastCombatText(wrongFloor, 5, "physical", "none");
    visibility.broadcastCreatureSpeech(visible, "Squeak!", false);
    visibility.broadcastCreatureSpeech(hidden, "Hidden", false);
    visibility.broadcastCreatureSpeech(wrongFloor, "Above", true);
    visibility.sendExperienceText(viewer.id, visible, 5);
    visibility.sendExperienceText(viewer.id, hidden, 5);
    visibility.sendExperienceText(viewer.id, wrongFloor, 5);
    visibility.broadcastMagicEffect(hidden.position, 1, hidden.id);
    visibility.broadcastDistanceMissile(
      visible.position,
      hidden.position,
      1,
      250,
      [visible.id, hidden.id],
    );

    expect(sent).toEqual([
      {
        type: "combat-text",
        position: visible.position,
        value: 5,
        damageType: "physical",
        block: "none",
      },
      {
        type: "creature-spoke",
        creatureId: visible.id,
        name: visible.name,
        mode: "say",
        position: visible.position,
        text: "Squeak!",
      },
      {
        type: "experience-text",
        position: visible.position,
        value: 5,
      },
    ]);
  });

  it("fully reconciles the mover and old/new observers after a teleport", () => {
    const world = new World(
      gridMapData({
        name: "teleport-test",
        width: 40,
        height: 40,
        blocked: [],
      }),
      25,
    );
    const mover = new Player(makeCharacter("mover"), { x: 5, y: 5, z: 7 });
    const oldObserver = new Player(makeCharacter("old-observer"), {
      x: 6,
      y: 5,
      z: 7,
    });
    const newObserver = new Player(makeCharacter("new-observer"), {
      x: 30,
      y: 30,
      z: 7,
    });
    const oldMonster = makeMonster("monster-instance:old:0", 5, 6, 7);
    const newMonster = makeMonster("monster-instance:new:0", 31, 29, 7);
    for (const player of [mover, oldObserver, newObserver]) {
      world.addPlayer(player);
    }
    world.addCreature(oldMonster);
    world.addCreature(newMonster);

    const messages = new Map<string, ServerMessage[]>();
    const sessions = [mover, oldObserver, newObserver].map((player) => {
      const sent: ServerMessage[] = [];
      messages.set(player.id, sent);
      return {
        id: `session-${player.id}`,
        playerId: player.id,
        viewRange: { x: 3, y: 3 },
        knownCreatureIds: new Set<string>(),
        knownMapItemTiles: new Map(),
        attackTargetId: null,
        send: (message: ServerMessage) => sent.push(message),
      } as unknown as Session;
    });
    const registry = {
      sessionFor: (playerId: string) =>
        sessions.find((session) => session.playerId === playerId),
      all: () => sessions,
    } as unknown as SessionRegistry;
    const visibility = new Visibility(world, registry);
    for (const session of sessions) {
      const player = world.getPlayer(session.playerId!);
      if (player) visibility.announceSpawn(session, player);
    }
    for (const sent of messages.values()) sent.length = 0;

    const from = world.relocateCreature(mover, { x: 30, y: 29, z: 7 });
    visibility.onPlayerTeleported(sessions[0]!, mover, from);

    expect(sessions[0]?.knownCreatureIds.has(oldObserver.id)).toBe(false);
    expect(sessions[0]?.knownCreatureIds.has(oldMonster.id)).toBe(false);
    expect(sessions[0]?.knownCreatureIds.has(newObserver.id)).toBe(true);
    expect(sessions[0]?.knownCreatureIds.has(newMonster.id)).toBe(true);
    expect(messages.get(mover.id)).toContainEqual(
      expect.objectContaining({
        type: "creature-moved",
        creatureId: mover.id,
        from: { x: 5, y: 5, z: 7 },
        position: { x: 30, y: 29, z: 7 },
        durationMs: 0,
      }),
    );
    expect(messages.get(oldObserver.id)).toContainEqual({
      type: "creature-left",
      creatureId: mover.id,
    });
    expect(messages.get(newObserver.id)).toContainEqual(
      expect.objectContaining({
        type: "creature-joined",
        creature: expect.objectContaining({ id: mover.id }),
      }),
    );
  });
});
