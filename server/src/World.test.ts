import { describe, expect, it } from "vitest";
import { Player } from "./Player";
import { World } from "./World";

const STEP_MS = 180;

const makeWorld = () => new World(10, 8, [[3, 2]], STEP_MS);

const makePlayer = (x: number, y: number) =>
  new Player("p1", "Tester", x, y, "south");

describe("World.tryMove", () => {
  it("moves onto a free walkable tile", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    const result = world.tryMove(player, "north", 1000);

    expect(result.moved).toBe(true);
    expect([player.x, player.y]).toEqual([5, 4]);
  });

  it("rejects steps outside the map bounds", () => {
    const world = makeWorld();
    const player = makePlayer(0, 0);
    world.addPlayer(player);

    const result = world.tryMove(player, "west", 1000);

    expect(result.moved).toBe(false);
    expect([player.x, player.y]).toEqual([0, 0]);
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
    const other = new Player("p2", "Blocker", 5, 4, "south");
    world.addPlayer(player);
    world.addPlayer(other);

    const result = world.tryMove(player, "north", 1000);

    expect(result.moved).toBe(false);
  });

  it("enforces the walk-speed cooldown server-side", () => {
    const world = makeWorld();
    const player = makePlayer(5, 5);
    world.addPlayer(player);

    expect(world.tryMove(player, "north", 1000).moved).toBe(true);

    const duringCooldown = world.tryMove(player, "north", 1000 + STEP_MS - 1);
    expect(duringCooldown.moved).toBe(false);
    expect([player.x, player.y]).toEqual([5, 4]);

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
    expect([player.x, player.y]).toEqual([5, 4]);
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
