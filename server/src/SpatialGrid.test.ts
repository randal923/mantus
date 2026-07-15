import { describe, expect, it } from "vitest";
import { Player } from "./Player";
import { SpatialGrid } from "./SpatialGrid";
import { makeCharacter } from "./test/makeCharacter";

const player = (id: string, x: number, y: number) =>
  new Player(makeCharacter(id), { x, y, z: 7 });

describe("SpatialGrid", () => {
  it("finds players within the box and excludes those outside", () => {
    const grid = new SpatialGrid(8);
    const near = player("near", 10, 10);
    const edge = player("edge", 19, 17);
    const far = player("far", 20, 10);
    grid.insert(near);
    grid.insert(edge);
    grid.insert(far);

    const found = grid.query(10, 10, 7, 9, 7).map((p) => p.id);
    expect(found).toContain("near");
    expect(found).toContain("edge");
    expect(found).not.toContain("far");
  });

  it("finds players across cell boundaries", () => {
    const grid = new SpatialGrid(8);
    const neighbor = player("neighbor", 8, 8);
    grid.insert(neighbor);
    expect(grid.query(7, 7, 7, 1, 1).map((p) => p.id)).toEqual(["neighbor"]);
  });

  it("re-buckets on move and stops matching the old position", () => {
    const grid = new SpatialGrid(8);
    const walker = player("walker", 7, 7);
    grid.insert(walker);

    const fromX = walker.x;
    const fromY = walker.y;
    walker.x = 8;
    walker.y = 7;
    grid.move(walker, fromX, fromY);

    expect(grid.query(8, 7, 7, 0, 0).map((p) => p.id)).toEqual(["walker"]);
    expect(grid.query(7, 7, 7, 0, 0)).toEqual([]);
  });

  it("removes players", () => {
    const grid = new SpatialGrid(8);
    const gone = player("gone", 3, 3);
    grid.insert(gone);
    grid.remove(gone);
    expect(grid.query(3, 3, 7, 8, 8)).toEqual([]);
  });
});
