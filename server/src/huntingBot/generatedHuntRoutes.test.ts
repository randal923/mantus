import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HUNTING_BOT_LIMITS, type Position } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { loadMapData } from "../loadMapData";
import { findRoutePath } from "./findRoutePath";

/**
 * `tools/buildHuntingPlaces.mjs` writes hunting routes from the map's own
 * walkability data, so its rings must survive the walker that will actually
 * follow them: every waypoint standable, and every leg — including the one
 * that closes the ring — solvable inside the budget the bot spends at
 * runtime. A guide route drawn on a wiki map may cut through rock; a
 * generated one may not.
 */

interface RoutePath {
  readonly Coordinates: Readonly<
    Record<string, ReadonlyArray<readonly [Position, Position]>>
  >;
}

interface HuntingSpot {
  readonly Name: string;
  readonly Generated?: boolean;
  readonly Position: Position;
  readonly RoutePath: RoutePath;
}

interface HuntingPlace {
  readonly Name: string;
  readonly Generated?: boolean;
  readonly RoutePath: RoutePath;
  readonly Spots?: ReadonlyArray<HuntingSpot>;
}

const places = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../client/public/assets/hunting/hunting_places.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as ReadonlyArray<HuntingPlace>;

/**
 * Every generated route in the catalog, whether it is a hunt of its own or one
 * cave gathered onto a hand-written hunt.
 */
const generated = places.flatMap((place) => [
  ...(place.Generated === true
    ? [{ name: place.Name, routePath: place.RoutePath, entrance: null }]
    : []),
  ...(place.Spots ?? [])
    .filter((spot) => spot.Generated === true)
    .map((spot) => ({
      name: `${place.Name} · ${spot.Name}`,
      routePath: spot.RoutePath,
      entrance: spot.Position,
    })),
]);

const map = loadMapData(
  fileURLToPath(new URL("../../data", import.meta.url)),
  "otservbr",
);

/** Mirrors the client's `extractRouteWaypoints`: the ring the bot is seeded with. */
const waypointsOf = (
  segments: ReadonlyArray<readonly [Position, Position]>,
): Position[] => {
  const waypoints: Position[] = [];
  for (const [start, end] of segments) {
    for (const position of [start, end]) {
      const last = waypoints.at(-1);
      if (
        last &&
        last.x === position.x &&
        last.y === position.y &&
        last.z === position.z
      ) {
        continue;
      }
      waypoints.push(position);
    }
  }
  const first = waypoints[0];
  const last = waypoints.at(-1);
  if (
    waypoints.length > 1 &&
    first &&
    last &&
    first.x === last.x &&
    first.y === last.y &&
    first.z === last.z
  ) {
    waypoints.pop();
  }
  return waypoints;
};

describe("generated hunting routes", () => {
  it("has generated hunts to check", () => {
    expect(generated.length).toBeGreaterThan(0);
  });

  for (const place of generated) {
    describe(place.name, () => {
      const floors = Object.entries(place.routePath.Coordinates);

      it("marks its entrance on walkable ground", () => {
        if (!place.entrance) return;
        expect(map.isWalkable(place.entrance)).toBe(true);
        expect(map.getGroundSpeed(place.entrance)).toBeTruthy();
      });

      it("patrols at least one floor", () => {
        expect(floors.length).toBeGreaterThan(0);
      });

      for (const [floor, segments] of floors) {
        const waypoints = waypointsOf(segments);

        it(`floor ${floor} stands on walkable ground`, () => {
          const unwalkable = waypoints.filter(
            (waypoint) =>
              !map.isWalkable(waypoint) || !map.getGroundSpeed(waypoint),
          );
          expect(unwalkable).toEqual([]);
        });

        it(`floor ${floor} fits one saved route`, () => {
          expect(waypoints.length).toBeGreaterThanOrEqual(3);
          expect(waypoints.length).toBeLessThanOrEqual(
            HUNTING_BOT_LIMITS.maxWaypoints,
          );
        });

        it(`floor ${floor} closes a ring the bot can walk`, () => {
          const unreachable = waypoints.flatMap((waypoint, index) => {
            const next = waypoints[(index + 1) % waypoints.length];
            if (!next) return [];
            const margin = HUNTING_BOT_LIMITS.pathSearchMargin;
            const { steps } = findRoutePath({
              map,
              start: waypoint,
              goal: next,
              bounds: {
                minX: Math.min(waypoint.x, next.x) - margin,
                maxX: Math.max(waypoint.x, next.x) + margin,
                minY: Math.min(waypoint.y, next.y) - margin,
                maxY: Math.max(waypoint.y, next.y) + margin,
              },
              maxVisited: HUNTING_BOT_LIMITS.maxRuntimeVisited,
            });
            return steps.length === 0
              ? [`${waypoint.x},${waypoint.y} → ${next.x},${next.y}`]
              : [];
          });
          expect(unreachable).toEqual([]);
        });
      }
    });
  }
});
