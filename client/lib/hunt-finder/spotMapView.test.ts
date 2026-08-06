import { describe, expect, it } from "vitest";
import type { HuntingSpot } from "./HuntingPlace";
import { spotMapView } from "./spotMapView";

const spot = (x: number, y: number, z = 8): HuntingSpot => ({
  Name: `${x},${y}`,
  Position: { x, y, z },
  RoutePath: { Coordinates: {}, Paths: [] },
});

describe("spotMapView", () => {
  it("centres on the entrances it has to show", () => {
    const view = spotMapView([spot(1_000, 2_000), spot(1_100, 2_200)], 640, 280);

    expect(view.center).toEqual({ x: 1_050, y: 2_100 });
  });

  it("puts a pin where the map draws its tile", () => {
    const view = spotMapView([spot(1_000, 2_000), spot(1_100, 2_200)], 640, 280);
    const left = view.center.x + 0.5 - 640 / (2 * view.pixelsPerTile);
    const top = view.center.y + 0.5 - 280 / (2 * view.pixelsPerTile);

    expect(view.project({ x: 1_000, y: 2_000, z: 8 })).toEqual({
      x: (1_000 - left) * view.pixelsPerTile,
      y: (2_000 - top) * view.pixelsPerTile,
    });
  });

  it("zooms out far enough to keep every entrance on the canvas", () => {
    const view = spotMapView([spot(1_000, 2_000), spot(1_400, 2_000)], 640, 280);
    const placed = view.project({ x: 1_400, y: 2_000, z: 8 });

    expect(placed.x).toBeGreaterThan(0);
    expect(placed.x).toBeLessThan(640);
  });

  it("draws the floor most entrances are on", () => {
    const view = spotMapView(
      [spot(1_000, 2_000, 9), spot(1_010, 2_010, 8), spot(1_020, 2_020, 8)],
      640,
      280,
    );

    expect(view.floor).toBe(8);
  });
});
