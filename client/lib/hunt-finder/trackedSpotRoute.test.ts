import { describe, expect, it } from "vitest";
import type { HuntingPlace, HuntingSpot } from "./HuntingPlace";
import { trackedSpotRoute } from "./trackedSpotRoute";

const place = {
  Name: "Darashia Rotworm Caves",
  WayPath: { Coordinates: {}, Paths: [] },
  RoutePath: { Coordinates: {}, Paths: [] },
} as unknown as HuntingPlace;

const spot: HuntingSpot = {
  Name: "North Cave",
  Position: { x: 33_225, y: 32_300, z: 7 },
  WayPath: {
    Coordinates: {
      "7": [
        [
          { x: 33_213, y: 32_454, z: 7 },
          { x: 33_225, y: 32_300, z: 7 },
        ],
      ],
    },
    Paths: ["From Darashia: climb down at 33225, 32300."],
    Position: { x: 33_217, y: 32_262, z: 8 },
  },
  RoutePath: {
    Coordinates: {
      "8": [
        [
          { x: 33_217, y: 32_262, z: 8 },
          { x: 33_220, y: 32_270, z: 8 },
        ],
      ],
    },
    Paths: [],
  },
};

describe("trackedSpotRoute", () => {
  it("draws the way in to the cave being read", () => {
    const route = trackedSpotRoute(place, spot);

    expect(route.name).toBe("Darashia Rotworm Caves · North Cave");
    expect(route.coordinates).toEqual(spot.WayPath?.Coordinates);
    expect(route.destination).toEqual({ x: 33_217, y: 32_262, z: 8 });
  });

  it("keeps a single-cave hunt named after the hunt itself", () => {
    const route = trackedSpotRoute(place, {
      ...spot,
      Name: "Darashia Rotworm Caves",
    });

    expect(route.name).toBe("Darashia Rotworm Caves");
  });

  it("falls back to the ring when a cave has no drawn approach", () => {
    const route = trackedSpotRoute(place, { ...spot, WayPath: undefined });

    expect(route.coordinates).toEqual(spot.RoutePath.Coordinates);
    expect(route.destination).toEqual(spot.Position);
  });
});
