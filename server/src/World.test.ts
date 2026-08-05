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
  it("turns without changing position or its revision", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(world.turnPlayer(player, "north")).toBe(true);
    expect(player.direction).toBe("north");
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
    expect(player.positionRevision).toBe(0);
    expect(world.turnPlayer(player, "north")).toBe(false);
  });

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

  it("resolves a floor transition without locking the next step", () => {
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
    if (!result.moved) throw new Error("expected floor transition");
    expect(result.durationMs).toBe(0);
    expect(player.position).toEqual(destination);
    expect(world.isOccupied(source)).toBe(false);
    expect(world.isOccupied(destination)).toBe(true);

    expect(world.tryMove(player, "east", 1000).moved).toBe(true);
    expect(player.position).toEqual({ x: 6, y: 3, z: 6 });
  });

  it("keeps state coherent when two players use one teleport in a tick", () => {
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
            kind: "teleport",
            activation: "step",
            source,
            destination,
            itemId: 1387,
          },
        ],
      }),
      STEP_MS,
    );
    const first = makePlayer(5, 5, 7, "first");
    const second = makePlayer(4, 4, 7, "second");
    world.addPlayer(first);
    world.addPlayer(second);

    // Both step onto the same teleport tile in the same tick.
    const firstMove = world.tryMove(first, "north", 1_000);
    const secondMove = world.tryMove(second, "east", 1_000);

    // Exactly one lands on the destination; the other is refused, not stacked.
    expect(firstMove.moved).toBe(true);
    expect(first.position).toEqual(destination);
    expect(secondMove.moved).toBe(false);
    expect(second.position).toEqual({ x: 4, y: 4, z: 7 });
    expect(world.isOccupied(destination)).toBe(true);
    expect(world.isOccupied(source)).toBe(false);

    // Once the destination clears, the second player teleports normally.
    expect(world.tryMove(first, "east", 1_000).moved).toBe(true);
    expect(world.tryMove(second, "east", 1_000).moved).toBe(true);
    expect(second.position).toEqual(destination);
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

  it("executes an adjacent ladder action without locking the next step", () => {
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

    const result = world.tryUseMap(player, source, 1000);

    expect(result.moved).toBe(true);
    if (!result.moved) throw new Error("expected ladder transition");
    expect(result.durationMs).toBe(0);
    expect(player.position).toEqual(destination);
    expect(world.tryMove(player, "east", 1000).moved).toBe(true);
    expect(player.position).toEqual({ x: 6, y: 5, z: 6 });
  });

  it("never climbs a rope spot via a bare use-map (rope required)", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 5, z: 6 };
    const world = new World(
      gridMapData({
        name: "rope-spot-use-map",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        actions: [
          {
            kind: "rope-spot",
            activation: "use-with",
            source,
            destination,
            itemId: 386,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    const result = world.tryUseMap(player, source, 1000);

    expect(result.moved).toBe(false);
    if (result.moved) throw new Error("unreachable");
    expect(result.reason).toBe("invalid-transition");
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("executes an adjacent rope-spot action through tryUseRopeSpot", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 5, z: 6 };
    const world = new World(
      gridMapData({
        name: "rope-spot-use-with",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        actions: [
          {
            kind: "rope-spot",
            activation: "use-with",
            source,
            destination,
            itemId: 386,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(world.tryUseRopeSpot(player, source, 1000).moved).toBe(true);
    expect(player.position).toEqual(destination);
  });

  it("does not treat a ladder as a rope spot", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 5, z: 6 };
    const world = new World(
      gridMapData({
        name: "ladder-not-rope",
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

    expect(world.tryUseRopeSpot(player, source, 1000).moved).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("rejects rope-spot use from more than one tile away", () => {
    const source = { x: 5, y: 2, z: 7 };
    const destination = { x: 5, y: 3, z: 6 };
    const world = new World(
      gridMapData({
        name: "rope-spot-distance",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        actions: [
          {
            kind: "rope-spot",
            activation: "use-with",
            source,
            destination,
            itemId: 386,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(world.tryUseRopeSpot(player, source, 1000).moved).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("rejects rope-spot use when the destination is occupied", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 5, z: 6 };
    const world = new World(
      gridMapData({
        name: "rope-spot-occupied",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        actions: [
          {
            kind: "rope-spot",
            activation: "use-with",
            source,
            destination,
            itemId: 386,
          },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    const blocker = makePlayer(destination.x, destination.y, destination.z, "p2");
    world.addPlayer(player);
    world.addPlayer(blocker);

    const result = world.tryUseRopeSpot(player, source, 1000);

    expect(result.moved).toBe(false);
    if (result.moved) throw new Error("unreachable");
    expect(result.reason).toBe("occupied");
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

describe("World.tryLevitate", () => {
  const cliffWorld = () =>
    new World(
      gridMapData({
        name: "levitate",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        // Open air above the caster at (5,5) and off the upper cliff at
        // (5,4): standing at z7 you can float up onto (5,4,6); standing on
        // the upper floor at (5,5,6) facing north you can float down.
        voids: [
          [5, 5, 6],
          [4, 4, 6],
        ],
      }),
      STEP_MS,
    );

  it("floats one tile forward and one floor up over a cliff", () => {
    const world = cliffWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);
    player.direction = "north";

    const result = world.tryLevitate(player, "up", 1000);

    expect(result.moved).toBe(true);
    if (!result.moved) throw new Error("expected levitate");
    expect(result.durationMs).toBe(0);
    expect(player.position).toEqual({ x: 5, y: 4, z: 6 });
  });

  it("refuses to float up through a ceiling", () => {
    const world = cliffWorld();
    const player = makePlayer(4, 5);
    world.addPlayer(player);
    player.direction = "north";

    expect(world.tryLevitate(player, "up", 1000).moved).toBe(false);
    expect(player.position).toEqual({ x: 4, y: 5, z: 7 });
  });

  it("floats down when facing open air", () => {
    const world = cliffWorld();
    const player = makePlayer(4, 5, 6);
    world.addPlayer(player);
    player.direction = "north";

    const result = world.tryLevitate(player, "down", 1000);

    expect(result.moved).toBe(true);
    expect(player.position).toEqual({ x: 4, y: 4, z: 7 });
  });

  it("refuses to float down when a tile is in front", () => {
    const world = cliffWorld();
    const player = makePlayer(3, 5, 6);
    world.addPlayer(player);
    player.direction = "north";

    expect(world.tryLevitate(player, "down", 1000).moved).toBe(false);
  });

  it("never crosses the surface boundary", () => {
    const world = new World(
      gridMapData({
        name: "levitate-surface",
        width: 10,
        height: 8,
        blocked: [],
        floors: [7, 8],
        groundSpeed: 50,
        voids: [[5, 5, 7]],
      }),
      STEP_MS,
    );
    const surface = makePlayer(4, 5, 7, "surface");
    const underground = makePlayer(5, 5, 8, "underground");
    world.addPlayer(surface);
    world.addPlayer(underground);
    surface.direction = "north";
    underground.direction = "north";

    expect(world.tryLevitate(surface, "down", 1000).moved).toBe(false);
    expect(world.tryLevitate(underground, "up", 1000).moved).toBe(false);
  });

  it("refuses to land on an occupied tile", () => {
    const world = cliffWorld();
    const player = makePlayer(5, 5);
    const blocker = makePlayer(5, 4, 6, "p2");
    world.addPlayer(player);
    world.addPlayer(blocker);
    player.direction = "north";

    expect(world.tryLevitate(player, "up", 1000).moved).toBe(false);
  });

  // Canary's levitate teleports on cast: a walk in flight must not make the
  // spell fizzle (which would cost the exhaust with nothing to show for it).
  it("floats mid-step instead of fizzling against the walk cooldown", () => {
    const world = cliffWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);
    player.direction = "north";
    player.nextStepAt = 5_000;

    const result = world.tryLevitate(player, "up", 1_000);

    expect(result.moved).toBe(true);
    expect(player.position).toEqual({ x: 5, y: 4, z: 6 });
  });
});

describe("World.trySpellRopeSpot", () => {
  const ropeWorld = () =>
    new World(
      gridMapData({
        name: "magic-rope-cooldown",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        actions: [
          {
            kind: "rope-spot",
            activation: "use-with",
            source: { x: 5, y: 5, z: 7 },
            destination: { x: 5, y: 5, z: 6 },
            itemId: 386,
          },
        ],
      }),
      STEP_MS,
    );

  it("climbs mid-step instead of fizzling against the walk cooldown", () => {
    const world = ropeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);
    player.nextStepAt = 5_000;

    expect(world.trySpellRopeSpot(player, player.position, 1_000).moved).toBe(
      true,
    );
    expect(player.position).toEqual({ x: 5, y: 5, z: 6 });
  });

  // The rope *item* keeps the walk cooldown; only the spell path is exempt.
  it("leaves the rope tool subject to the walk cooldown", () => {
    const world = ropeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);
    player.nextStepAt = 5_000;

    const result = world.tryUseRopeSpot(player, player.position, 1_000);

    expect(result.moved).toBe(false);
    if (result.moved) throw new Error("unreachable");
    expect(result.reason).toBe("cooldown");
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });
});

describe("pz-lock blocks protection-zone transitions", () => {
  const pzLock = (player: Player) =>
    player.conditions.apply(
      { type: "pz-lock", sourceId: null, durationMs: 60_000 },
      0,
    );

  it("rejects a pz-locked player climbing a ladder into a protection zone", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 5, z: 6 };
    const world = new World(
      gridMapData({
        name: "ladder-pz",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        protectionZones: [[destination.x, destination.y, destination.z]],
        actions: [
          { kind: "ladder", activation: "use", source, destination, itemId: 1948 },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    pzLock(player);
    world.addPlayer(player);

    const result = world.tryUseMap(player, source, 1000);

    expect(result.moved).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("rejects a pz-locked player roping into a protection zone", () => {
    const source = { x: 5, y: 4, z: 7 };
    const destination = { x: 5, y: 5, z: 6 };
    const world = new World(
      gridMapData({
        name: "rope-pz",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        protectionZones: [[destination.x, destination.y, destination.z]],
        actions: [
          { kind: "rope-spot", activation: "use-with", source, destination, itemId: 386 },
        ],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    pzLock(player);
    world.addPlayer(player);

    const result = world.tryUseRopeSpot(player, source, 1000);

    expect(result.moved).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("rejects a pz-locked player levitating into a protection zone", () => {
    const destination = { x: 5, y: 4, z: 6 };
    const world = new World(
      gridMapData({
        name: "levitate-pz",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        // Open air directly above the caster so there is no ceiling to block
        // the float; the landing tile is a protection zone.
        voids: [[5, 5, 6]],
        protectionZones: [[destination.x, destination.y, destination.z]],
      }),
      STEP_MS,
    );
    const player = makePlayer(5, 5);
    player.direction = "north";
    pzLock(player);
    world.addPlayer(player);

    const result = world.tryLevitate(player, "up", 1000);

    expect(result.moved).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });
});

describe("World underground multi-floor visibility", () => {
  const RANGE = { x: 8, y: 6 };
  const openFloor = (z: number, width: number, height: number) =>
    Array.from({ length: width }, (_, x) =>
      Array.from({ length: height }, (_, y) => [x, y, z] as const),
    ).flat();

  const undergroundWorld = (open: boolean) =>
    new World(
      gridMapData({
        name: "underground",
        width: 14,
        height: 14,
        blocked: [],
        floors: [8, 9, 10, 11],
        groundSpeed: 50,
        // When `open`, floor 8 lets sight pass so a z=9 viewer sees up to z=8;
        // otherwise every tile limits floor view (a solid ceiling).
        transparentFloorView: open ? openFloor(8, 14, 14) : [],
      }),
      STEP_MS,
    );

  const ids = (world: World, position: { x: number; y: number; z: number }) =>
    world.creaturesVisibleFrom(position, RANGE).map((creature) => creature.id);

  it("shows a creature on the floor directly below (z+1)", () => {
    const world = undergroundWorld(false);
    const viewer = makePlayer(5, 5, 9, "viewer");
    const below = makePlayer(5, 5, 10, "below");
    world.addPlayer(viewer);
    world.addPlayer(below);

    expect(ids(world, viewer.position)).toContain("below");
  });

  it("does not leak a creature one floor up when the ceiling covers it", () => {
    const world = undergroundWorld(false);
    const viewer = makePlayer(5, 5, 9, "viewer");
    const above = makePlayer(5, 5, 8, "above");
    world.addPlayer(viewer);
    world.addPlayer(above);

    expect(ids(world, viewer.position)).not.toContain("above");
  });

  it("shows a creature one floor up through an open shaft (z-1)", () => {
    const world = undergroundWorld(true);
    const viewer = makePlayer(5, 5, 9, "viewer");
    const above = makePlayer(5, 5, 8, "above");
    world.addPlayer(viewer);
    world.addPlayer(above);

    expect(ids(world, viewer.position)).toContain("above");
  });

  it("does not reveal a creature beyond the aware range (z+3)", () => {
    const world = undergroundWorld(false);
    const viewer = makePlayer(5, 5, 8, "viewer");
    const deep = makePlayer(5, 5, 11, "deep");
    world.addPlayer(viewer);
    world.addPlayer(deep);

    expect(ids(world, viewer.position)).not.toContain("deep");
  });
});

describe("World.canCreatureSee cache equivalence", () => {
  const RANGE = { x: 8, y: 6 };

  it("matches the uncached position overload before and after moves", () => {
    const world = makeWorld();
    const viewer = makePlayer(5, 5, 7, "viewer");
    const target = makePlayer(2, 3, 7, "target");
    world.addPlayer(viewer);
    world.addPlayer(target);

    expect(world.canCreatureSee(viewer, target.position, RANGE)).toBe(
      world.canSee(viewer.position, target.position, RANGE),
    );
    expect(world.canCreatureSee(viewer, target.position, RANGE)).toBe(true);

    // Moving the viewer must invalidate its cached first-visible floor.
    world.tryMove(viewer, "east", 1_000);
    expect(world.canCreatureSee(viewer, target.position, RANGE)).toBe(
      world.canSee(viewer.position, target.position, RANGE),
    );

    // Out-of-range targets stay invisible through the cached path.
    const far = { x: viewer.position.x + RANGE.x + 2, y: 5, z: 7 };
    expect(world.canCreatureSee(viewer, far, RANGE)).toBe(false);
    expect(world.canSee(viewer.position, far, RANGE)).toBe(false);
  });

  it("agrees with the position overload across floors underground", () => {
    const world = new World(
      gridMapData({
        name: "underground-eq",
        width: 14,
        height: 14,
        blocked: [],
        floors: [8, 9, 10, 11],
        groundSpeed: 50,
      }),
      STEP_MS,
    );
    const viewer = makePlayer(5, 5, 9, "viewer");
    world.addPlayer(viewer);
    for (const z of [8, 9, 10, 11] as const) {
      const position = { x: 5, y: 5, z };
      expect(world.canCreatureSee(viewer, position, RANGE)).toBe(
        world.canSee(viewer.position, position, RANGE),
      );
    }
  });
});
