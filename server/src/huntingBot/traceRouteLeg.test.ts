import { describe, expect, it } from "vitest";
import type { Position } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { traceRouteLeg } from "./traceRouteLeg";

const chebyshev = (from: Position, to: Position): number =>
  Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));

describe("traceRouteLeg", () => {
  it("reports a corner instead of the straight line through a wall", () => {
    const map = gridMapData({
      name: "test",
      width: 20,
      height: 20,
      // Wall along x=5 from y=0..8, so the only way south is around y=9.
      blocked: Array.from({ length: 9 }, (_, y) => [5, y] as const),
    });

    const leg = traceRouteLeg(map, { x: 3, y: 2, z: 7 }, { x: 7, y: 2, z: 7 });

    expect(leg.resolved).toBe(true);
    expect(leg.waypoints.at(-1)).toEqual({ x: 7, y: 2, z: 7 });
    // The straight line crosses the wall; the traced chain must not.
    for (const waypoint of leg.waypoints) {
      expect(map.isWalkable(waypoint)).toBe(true);
    }
    expect(leg.waypoints.length).toBeGreaterThan(1);
  });

  it("collapses a straight run into few waypoints but never long gaps", () => {
    const map = gridMapData({ name: "test", width: 60, height: 60, blocked: [] });

    const leg = traceRouteLeg(map, { x: 1, y: 1, z: 7 }, { x: 40, y: 1, z: 7 });

    expect(leg.resolved).toBe(true);
    let previous = { x: 1, y: 1, z: 7 };
    for (const waypoint of leg.waypoints) {
      expect(chebyshev(previous, waypoint)).toBeLessThanOrEqual(12);
      previous = waypoint;
    }
    expect(leg.waypoints.at(-1)).toEqual({ x: 40, y: 1, z: 7 });
  });

  it("reports an unreachable leg instead of inventing a route", () => {
    const map = gridMapData({
      name: "test",
      width: 20,
      height: 20,
      blocked: Array.from({ length: 20 }, (_, y) => [5, y] as const),
    });

    const leg = traceRouteLeg(map, { x: 3, y: 2, z: 7 }, { x: 7, y: 2, z: 7 });

    expect(leg.resolved).toBe(false);
    expect(leg.waypoints).toEqual([]);
  });

  it("emits a waypoint on the landing tile of a floor change", () => {
    const map = gridMapData({
      name: "test",
      width: 20,
      height: 20,
      blocked: [],
      floors: [6, 7],
      transitions: [
        {
          kind: "floor-change",
          activation: "step",
          itemId: 1_949,
          source: { x: 4, y: 2, z: 7 },
          destination: { x: 4, y: 2, z: 6 },
        },
      ],
    });

    const leg = traceRouteLeg(map, { x: 1, y: 2, z: 7 }, { x: 6, y: 2, z: 6 });

    expect(leg.resolved).toBe(true);
    expect(leg.waypoints).toContainEqual({ x: 4, y: 2, z: 6 });
    expect(leg.waypoints.at(-1)).toEqual({ x: 6, y: 2, z: 6 });
  });

  it("treats an already-reached anchor as resolved with nothing to walk", () => {
    const map = gridMapData({ name: "test", width: 10, height: 10, blocked: [] });

    const leg = traceRouteLeg(map, { x: 2, y: 2, z: 7 }, { x: 2, y: 2, z: 7 });

    expect(leg).toMatchObject({ resolved: true, waypoints: [] });
  });
});
