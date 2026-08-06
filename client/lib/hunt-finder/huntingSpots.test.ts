import { describe, expect, it } from "vitest";
import type { HuntingPlace } from "./HuntingPlace";
import { huntingSpots } from "./huntingSpots";

const place = (overrides: Partial<HuntingPlace> = {}): HuntingPlace =>
  ({
    Name: "Darashia Rotworm Caves",
    Level: "8",
    Type: ["Solo"],
    "Xp/Hour": "10K",
    "Loot/Hour": "2K",
    Location: "Darashia",
    Vocation: ["Knight"],
    PremiumRequired: false,
    RouteRequirements: "None",
    RecommendedImbues: {},
    RecommendedSupplies: {},
    ValuableDrops: [],
    Monsters: [{ Name: "Rotworm" }],
    WayPath: {
      Coordinates: {},
      Paths: [],
      Position: { x: 33_133, y: 32_432, z: 8 },
    },
    RoutePath: {
      Coordinates: {
        "9": [
          [
            { x: 33_105, y: 32_379, z: 9 },
            { x: 33_173, y: 32_460, z: 9 },
          ],
        ],
      },
      Paths: [],
    },
    Equipments: {},
    ...overrides,
  }) as HuntingPlace;

describe("huntingSpots", () => {
  it("gives a hunt with one cave a single spot named after it", () => {
    const spots = huntingSpots(place());

    expect(spots).toHaveLength(1);
    expect(spots[0]?.Name).toBe("Darashia Rotworm Caves");
    expect(spots[0]?.Position).toEqual({ x: 33_133, y: 32_432, z: 8 });
  });

  it("puts the hunt's own cave first, under its spot name", () => {
    const spots = huntingSpots(
      place({
        SpotName: "NorthWest Cave",
        Spots: [
          {
            Name: "North Cave",
            Generated: true,
            Position: { x: 33_217, y: 32_262, z: 8 },
            RoutePath: { Coordinates: {}, Paths: [] },
          },
        ],
      }),
    );

    expect(spots.map((spot) => spot.Name)).toEqual([
      "NorthWest Cave",
      "North Cave",
    ]);
    expect(spots[0]?.RoutePath.Coordinates["9"]).toHaveLength(1);
  });

  it("falls back to the first route tile when a guide has no way-in position", () => {
    const spots = huntingSpots(
      place({ WayPath: { Coordinates: {}, Paths: [] } }),
    );

    expect(spots[0]?.Position).toEqual({ x: 33_105, y: 32_379, z: 9 });
  });
});
