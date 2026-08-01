import { describe, expect, it } from "vitest";
import { gridMapData } from "../gridMapData";
import { snapToWalkable } from "./snapToWalkable";

describe("snapToWalkable", () => {
  it("keeps a point that is already standable", () => {
    const map = gridMapData({ name: "test", width: 10, height: 10, blocked: [] });

    expect(snapToWalkable(map, { x: 3, y: 3, z: 7 }, 4)).toEqual({
      x: 3,
      y: 3,
      z: 7,
    });
  });

  it("nudges a point inside a wall onto the nearest ground", () => {
    const map = gridMapData({
      name: "test",
      width: 10,
      height: 10,
      blocked: [
        [3, 3],
        [3, 4],
        [4, 3],
        [4, 4],
      ],
    });

    const snapped = snapToWalkable(map, { x: 3, y: 3, z: 7 }, 4);

    expect(snapped).not.toBeNull();
    expect(map.isWalkable(snapped!)).toBe(true);
    expect(
      Math.max(Math.abs(snapped!.x - 3), Math.abs(snapped!.y - 3)),
    ).toBe(1);
  });

  it("stays on the point's own floor", () => {
    const map = gridMapData({
      name: "test",
      width: 10,
      height: 10,
      blocked: [[3, 3]],
      floors: [6, 7],
    });

    expect(snapToWalkable(map, { x: 3, y: 3, z: 7 }, 4)?.z).toBe(7);
  });

  it("gives up rather than searching across a wall", () => {
    const map = gridMapData({
      name: "test",
      width: 12,
      height: 12,
      blocked: Array.from({ length: 12 }, (_, x) =>
        Array.from({ length: 12 }, (_, y) => [x, y] as const),
      ).flat(),
    });

    expect(snapToWalkable(map, { x: 5, y: 5, z: 7 }, 3)).toBeNull();
  });
});
