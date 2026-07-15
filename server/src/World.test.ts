import { describe, expect, it } from "vitest";
import { gridMapData } from "./gridMapData";
import { Player } from "./Player";
import { makeCharacter } from "./test/makeCharacter";
import { World } from "./World";

const STEP_MS = 180;

const makeWorld = () =>
  new World(
    gridMapData({ name: "test", width: 10, height: 8, blocked: [[3, 2]] }),
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
