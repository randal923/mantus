import { describe, expect, it } from "vitest";
import type { HuntingPath } from "../hunt-finder/HuntingPlace";
import { extractRouteWaypoints } from "./extractRouteWaypoints";

const at = (x: number, y: number, z = 8) => ({ x, y, z });

function path(
  segments: Record<string, ReadonlyArray<readonly [unknown, unknown]>>,
): HuntingPath {
  return { Coordinates: segments, Paths: [] } as unknown as HuntingPath;
}

describe("extractRouteWaypoints", () => {
  it("chains an end-to-end route into one ordered ring", () => {
    const waypoints = extractRouteWaypoints(
      path({
        "8": [
          [at(1, 1), at(5, 1)],
          [at(5, 1), at(5, 5)],
          [at(5, 5), at(1, 1)],
        ],
      }),
      8,
    );

    expect(waypoints).toEqual([at(1, 1), at(5, 1), at(5, 5)]);
  });

  it("keeps a dead-end spur in the walking order", () => {
    const waypoints = extractRouteWaypoints(
      path({
        "8": [
          [at(1, 1), at(5, 1)],
          // The guide branches: this segment restarts from an earlier tile.
          [at(5, 1), at(9, 1)],
          [at(5, 1), at(5, 5)],
        ],
      }),
      8,
    );

    expect(waypoints).toEqual([at(1, 1), at(5, 1), at(9, 1), at(5, 1), at(5, 5)]);
  });

  it("reads only the requested floor", () => {
    const waypoints = extractRouteWaypoints(
      path({
        "7": [[at(1, 1, 7), at(2, 1, 7)]],
        "8": [[at(9, 9), at(9, 8)]],
      }),
      8,
    );

    expect(waypoints).toEqual([at(9, 9), at(9, 8)]);
  });

  it("returns nothing for a floor the guide does not cover", () => {
    expect(extractRouteWaypoints(path({ "8": [] }), 3)).toEqual([]);
  });
});
