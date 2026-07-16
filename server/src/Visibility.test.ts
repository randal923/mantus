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
  },
  targetStrategy: { nearest: 100, health: 0, damage: 0, random: 0 },
  attacks: [],
  defenses: [],
  elements: {},
  immunities: [],
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
});
