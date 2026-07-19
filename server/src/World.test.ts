import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";
import { gridMapData } from "./gridMapData";
import { Player } from "./Player";
import { makeCharacter } from "./test/makeCharacter";
import { World } from "./World";

const STEP_MS = 180;

const makeWorld = () =>
  new World(
    gridMapData({
      name: "test",
      width: 10,
      height: 8,
      blocked: [[3, 2]],
      groundSpeed: 50,
    }),
    STEP_MS,
  );

const makePlayer = (x: number, y: number, z = 7, id = "p1") =>
  new Player(makeCharacter(id, "Tester"), { x, y, z });

describe("World.tryMove", () => {
  it("moves onto a free walkable tile", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    const result = world.tryMove(player, "north", 1000);

    expect(result.moved).toBe(true);
    expect(player.position).toEqual({ x: 5, y: 4, z: 7 });
    if (!result.moved) throw new Error("expected movement");
    expect(result.durationMs).toBe(STEP_MS);
    expect(player.positionRevision).toBe(1);
  });

  it("moves diagonally with Canary's three-times step duration", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    const result = world.tryMove(player, "northeast", 1000);

    expect(result.moved).toBe(true);
    expect(player.position).toEqual({ x: 6, y: 4, z: 7 });
    if (!result.moved) throw new Error("expected diagonal movement");
    expect(result.durationMs).toBe(STEP_MS * 3);
  });

  it("rejects steps outside the map bounds", () => {
    const world = makeWorld();
    const player = makePlayer(0, 0);
    world.addPlayer(player);

    const result = world.tryMove(player, "west", 1000);

    expect(result.moved).toBe(false);
    expect(player.position).toEqual({ x: 0, y: 0, z: 7 });
  });

  it("rejects steps onto blocked tiles", () => {
    const world = makeWorld();
    const player = makePlayer(2, 2);
    world.addPlayer(player);

    const result = world.tryMove(player, "east", 1000);

    expect(result.moved).toBe(false);
  });

  it("rejects steps onto occupied tiles", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    const other = new Player(makeCharacter("p2", "Blocker"), {
      x: 5,
      y: 4,
      z: 7,
    });
    world.addPlayer(player);
    world.addPlayer(other);

    const result = world.tryMove(player, "north", 1000);

    expect(result.moved).toBe(false);
  });

  it("does not treat the same x/y on another floor as occupied", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    const otherFloor = makePlayer(5, 4, 8, "p2");
    world.addPlayer(player);
    world.addPlayer(otherFloor);

    expect(world.tryMove(player, "north", 1000).moved).toBe(true);
  });

  it("serializes simultaneous moves into one destination to one winner", () => {
    const world = makeWorld();
    const west = makePlayer(4, 5, 7, "west");
    const east = makePlayer(6, 5, 7, "east");
    world.addPlayer(west);
    world.addPlayer(east);

    expect(world.tryMove(west, "east", 1000).moved).toBe(true);
    expect(world.tryMove(east, "west", 1000).moved).toBe(false);
    expect(west.position).toEqual({ x: 5, y: 5, z: 7 });
    expect(east.position).toEqual({ x: 6, y: 5, z: 7 });
  });

  it("resolves a server-authored floor transition atomically", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 3, z: 6 };
    const world = new World(
      gridMapData({
        name: "transitions",
        width: 10,
        height: 8,
        blocked: [],
        groundSpeed: 50,
        floors: [6, 7],
        transitions: [
          {
            kind: "floor-change",
            activation: "step",
            source,
            destination,
            itemId: 1947,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    const result = world.tryMove(player, "north", 1000);

    expect(result.moved).toBe(true);
    expect(player.position).toEqual(destination);
    expect(world.isOccupied(source)).toBe(false);
    expect(world.isOccupied(destination)).toBe(true);
  });

  it("rejects a floor transition when its destination is occupied", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 3, z: 6 };
    const world = new World(
      gridMapData({
        name: "transitions",
        width: 10,
        height: 8,
        blocked: [],
        groundSpeed: 50,
        floors: [6, 7],
        transitions: [
          {
            kind: "floor-change",
            activation: "step",
            source,
            destination,
            itemId: 1947,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    const blocker = makePlayer(5, 3, 6, "blocker");
    world.addPlayer(player);
    world.addPlayer(blocker);

    expect(world.tryMove(player, "north", 1000).moved).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("rejects a floor transition when its destination is blocked", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 3, z: 6 };
    const world = new World(
      gridMapData({
        name: "transitions",
        width: 10,
        height: 8,
        blocked: [[5, 3]],
        groundSpeed: 50,
        floors: [6, 7],
        transitions: [
          {
            kind: "floor-change",
            activation: "step",
            source,
            destination,
            itemId: 1947,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(world.tryMove(player, "north", 1000).moved).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
    expect(world.isOccupied(source)).toBe(false);
    expect(world.isOccupied(destination)).toBe(false);
  });

  it("enforces the walk-speed cooldown server-side", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(world.tryMove(player, "north", 1000).moved).toBe(true);

    const duringCooldown = world.tryMove(player, "north", 1000 + STEP_MS - 1);
    expect(duringCooldown.moved).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 4, z: 7 });

    expect(world.tryMove(player, "north", 1000 + STEP_MS).moved).toBe(true);
  });

  it("derives duration from destination ground and server-side speed conditions", () => {
    const fastWorld = makeWorld();
    const fast = makePlayer(5, 5);
    fastWorld.addPlayer(fast);
    const fastResult = fastWorld.tryMove(fast, "north", 1000);

    const slowWorld = makeWorld();
    const slowed = makePlayer(5, 5);
    slowed.setSpeedModifier(-50);
    slowWorld.addPlayer(slowed);
    const slowResult = slowWorld.tryMove(slowed, "north", 1000);

    if (!fastResult.moved || !slowResult.moved) {
      throw new Error("expected both movements");
    }
    expect(slowResult.durationMs).toBeGreaterThan(fastResult.durationMs);
  });

  it("uses a slower destination ground for the next-step deadline", () => {
    const world = new World(
      gridMapData({
        name: "ground-speed",
        width: 10,
        height: 8,
        blocked: [],
        groundSpeed: 50,
        groundSpeeds: [[5, 4, 7, 100]],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    const result = world.tryMove(player, "north", 1000);

    if (!result.moved) throw new Error("expected movement");
    expect(result.durationMs).toBe(STEP_MS * 2);
    expect(world.tryMove(player, "north", 1000 + STEP_MS).moved).toBe(false);
  });

  it("executes an adjacent server-authored ladder action", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 5, z: 6 };
    const world = new World(
      gridMapData({
        name: "ladder",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        actions: [
          {
            kind: "ladder",
            activation: "use",
            source,
            destination,
            itemId: 1948,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(world.tryUseMap(player, source, 1000).moved).toBe(true);
    expect(player.position).toEqual(destination);
  });

  it("executes a ladder action from a diagonally adjacent tile", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 5, z: 6 };
    const world = new World(
      gridMapData({
        name: "ladder-diagonal",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        actions: [
          {
            kind: "ladder",
            activation: "use",
            source,
            destination,
            itemId: 1948,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(4, 5);
    world.addPlayer(player);

    expect(world.tryUseMap(player, source, 1000).moved).toBe(true);
    expect(player.position).toEqual(destination);
  });

  it("executes an adjacent server-authored dropdown action", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 4, z: 8 };
    const world = new World(
      gridMapData({
        name: "dropdown",
        width: 10,
        height: 8,
        blocked: [],
        floors: [7, 8],
        groundSpeed: 50,
        actions: [
          {
            kind: "dropdown",
            activation: "use",
            source,
            destination,
            itemId: 435,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(world.tryUseMap(player, source, 1000).moved).toBe(true);
    expect(player.position).toEqual(destination);
  });

  it("rejects remote map use and packets that forge movement coordinates", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(
      world.tryUseMap(player, { x: 8, y: 5, z: 7 }, 1000).moved,
    ).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
    expect(
      clientMessageSchema.safeParse({
        type: "move",
        direction: "north",
        position: { x: 5, y: 4, z: 6 },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: "move", direction: "up-right" })
        .success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "auto-walk",
        positionRevision: 0,
        directions: ["northeast"],
        destination: { x: 6, y: 4, z: 7 },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "use-map",
        position: { x: 5, y: 4, z: 16 },
      }).success,
    ).toBe(false);
  });

  it("turns without stepping when the cooldown has not expired", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(world.tryMove(player, "north", 1000).moved).toBe(true);

    const result = world.tryMove(player, "east", 1000 + STEP_MS - 1);

    expect(result.moved).toBe(false);
    expect(result.turned).toBe(true);
    expect(player.direction).toBe("east");
    expect(player.position).toEqual({ x: 5, y: 4, z: 7 });
  });

  it("still turns the player when the step is rejected", () => {
    const world = makeWorld();
    const player = makePlayer(0, 0);
    world.addPlayer(player);

    const result = world.tryMove(player, "west", 1000);

    expect(result.turned).toBe(true);
    expect(player.direction).toBe("west");
  });
});
