import { describe, expect, it } from "vitest";
import { Player } from "./Player";
import { SpatialGrid } from "./SpatialGrid";
import { makeCharacter } from "./test/makeCharacter";

const player = (id: string, x: number, y: number, z = 7) =>
  new Player(makeCharacter(id), { x, y, z });

describe("SpatialGrid", () => {
  it("finds players within the box and excludes those outside", () => {
    const grid = new SpatialGrid(8);
    const near = player("near", 10, 10);
    const edge = player("edge", 19, 17);
    const far = player("far", 20, 10);
    grid.insert(near);
    grid.insert(edge);
    grid.insert(far);

    const found = grid.query({ x: 10, y: 10, z: 7 }, 9, 7).map((p) => p.id);
    expect(found).toContain("near");
    expect(found).toContain("edge");
    expect(found).not.toContain("far");
  });

  it("finds players across cell boundaries", () => {
    const grid = new SpatialGrid(8);
    const neighbor = player("neighbor", 8, 8);
    grid.insert(neighbor);
    expect(grid.query({ x: 7, y: 7, z: 7 }, 1, 1).map((p) => p.id)).toEqual([
      "neighbor",
    ]);
  });

  it("re-buckets on move and stops matching the old position", () => {
    const grid = new SpatialGrid(8);
    const walker = player("walker", 7, 7);
    grid.insert(walker);

    const from = walker.position;
    walker.moveTo({ x: 8, y: 7, z: 7 });
    grid.move(walker, from);

    expect(grid.query({ x: 8, y: 7, z: 7 }, 0, 0).map((p) => p.id)).toEqual([
      "walker",
    ]);
    expect(grid.query({ x: 7, y: 7, z: 7 }, 0, 0)).toEqual([]);
  });

  it("keeps equal x/y positions on different floors separate", () => {
    const grid = new SpatialGrid(8);
    const ground = player("ground", 10, 10, 7);
    const underground = player("underground", 10, 10, 8);
    grid.insert(ground);
    grid.insert(underground);

    expect(grid.query({ x: 10, y: 10, z: 7 }, 0, 0)).toEqual([ground]);
    expect(grid.query({ x: 10, y: 10, z: 8 }, 0, 0)).toEqual([
      underground,
    ]);
  });

  it("re-buckets a player after a floor change", () => {
    const grid = new SpatialGrid(8);
    const walker = player("walker", 7, 7);
    grid.insert(walker);

    const from = walker.position;
    walker.moveTo({ x: 7, y: 7, z: 8 });
    grid.move(walker, from);

    expect(grid.query({ x: 7, y: 7, z: 7 }, 0, 0)).toEqual([]);
    expect(grid.query({ x: 7, y: 7, z: 8 }, 0, 0)).toEqual([walker]);
  });

  it("removes players", () => {
    const grid = new SpatialGrid(8);
    const gone = player("gone", 3, 3);
    grid.insert(gone);
    grid.remove(gone);
    expect(grid.query({ x: 3, y: 3, z: 7 }, 8, 8)).toEqual([]);
  });
});
