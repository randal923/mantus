import { describe, expect, it } from "vitest";
import type { HuntingSpot } from "../hunt-finder/HuntingPlace";
import { guideRouteFor } from "./guideRouteFor";

const spot: HuntingSpot = {
  Name: "Far NorthWest Cave",
  Position: { x: 33_017, y: 32_357, z: 7 },
  RoutePath: {
    Coordinates: {
      "8": [
        [
          { x: 33_010, y: 32_349, z: 8 },
          { x: 33_025, y: 32_349, z: 8 },
        ],
        [
          { x: 33_025, y: 32_349, z: 8 },
          { x: 33_010, y: 32_349, z: 8 },
        ],
      ],
      "9": [
        [
          { x: 33_032, y: 32_332, z: 9 },
          { x: 33_044, y: 32_329, z: 9 },
        ],
        [
          { x: 33_044, y: 32_329, z: 9 },
          { x: 33_032, y: 32_332, z: 9 },
        ],
      ],
    },
    Paths: [],
  },
};

describe("guideRouteFor", () => {
  it("seeds every floor the cave describes", () => {
    const { waypoints } = guideRouteFor(spot, null);

    expect(waypoints.map((waypoint) => waypoint.z)).toEqual([8, 8, 9, 9]);
  });

  it("leads with the floor the character is standing on", () => {
    const { floor, waypoints } = guideRouteFor(spot, 9);

    expect(floor).toBe(9);
    expect(waypoints.map((waypoint) => waypoint.z)).toEqual([9, 9, 8, 8]);
  });

  it("keeps each floor's ring contiguous", () => {
    const { waypoints } = guideRouteFor(spot, null);
    const floors = waypoints.map((waypoint) => waypoint.z);

    expect(floors.indexOf(9)).toBe(floors.lastIndexOf(8) + 1);
  });

  it("has nothing to seed from a cave with no drawn route", () => {
    expect(
      guideRouteFor(
        { ...spot, RoutePath: { Coordinates: {}, Paths: [] } },
        null,
      ),
    ).toEqual({ floor: null, waypoints: [] });
  });
});
