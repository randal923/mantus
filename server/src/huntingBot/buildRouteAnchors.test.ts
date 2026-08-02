import { describe, expect, it } from "vitest";
import { HUNTING_BOT_LIMITS } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { buildRouteAnchors } from "./buildRouteAnchors";

describe("buildRouteAnchors", () => {
  it("subdivides a long guide segment along its own straight line", () => {
    const map = gridMapData({ name: "test", width: 80, height: 80, blocked: [] });

    const anchors = buildRouteAnchors(map, [
      { x: 10, y: 10, z: 7 },
      { x: 60, y: 10, z: 7 },
    ]);

    expect(anchors.at(0)?.position).toEqual({ x: 10, y: 10, z: 7 });
    expect(anchors.at(-1)?.position).toEqual({ x: 60, y: 10, z: 7 });
    let previous = anchors[0]!.position;
    for (const anchor of anchors.slice(1)) {
      const gap = Math.max(
        Math.abs(anchor.position.x - previous.x),
        Math.abs(anchor.position.y - previous.y),
      );
      expect(gap).toBeLessThanOrEqual(HUNTING_BOT_LIMITS.traceAnchorSpacing);
      previous = anchor.position;
    }
    // Every sample sits on the guide's own line, not off in open ground.
    for (const anchor of anchors) expect(anchor.position.y).toBe(10);
  });

  it("nudges guide points that land inside geometry onto real ground", () => {
    const map = gridMapData({
      name: "test",
      width: 40,
      height: 40,
      blocked: [[20, 10]],
    });

    const anchors = buildRouteAnchors(map, [
      { x: 10, y: 10, z: 7 },
      { x: 20, y: 10, z: 7 },
    ]);

    const last = anchors.at(-1);
    expect(last?.snapped).toBe(true);
    expect(map.isWalkable(last!.position)).toBe(true);
    expect(last?.position).not.toEqual({ x: 20, y: 10, z: 7 });
  });

  it("keeps an unsnappable endpoint and marks it for the window", () => {
    const map = gridMapData({
      name: "test",
      width: 40,
      height: 40,
      blocked: Array.from({ length: 11 }, (_, dx) =>
        Array.from({ length: 11 }, (_, dy) => [15 + dx, 5 + dy] as const),
      ).flat(),
    });

    const anchors = buildRouteAnchors(map, [
      { x: 5, y: 10, z: 7 },
      { x: 20, y: 10, z: 7 },
    ]);

    const last = anchors.at(-1);
    expect(last?.position).toEqual({ x: 20, y: 10, z: 7 });
    expect(last?.snapped).toBe(false);
  });

  it("does not sample across a floor change", () => {
    const map = gridMapData({
      name: "test",
      width: 80,
      height: 80,
      blocked: [],
      floors: [6, 7],
    });

    const anchors = buildRouteAnchors(map, [
      { x: 10, y: 10, z: 7 },
      { x: 60, y: 10, z: 6 },
    ]);

    expect(anchors).toEqual([
      { position: { x: 10, y: 10, z: 7 }, snapped: true },
      { position: { x: 60, y: 10, z: 6 }, snapped: true },
    ]);
  });

  it("caps how far one absurd segment can be subdivided", () => {
    const map = gridMapData({
      name: "test",
      width: 4_000,
      height: 4_000,
      blocked: [],
    });

    const anchors = buildRouteAnchors(map, [
      { x: 100, y: 100, z: 7 },
      { x: 3_900, y: 100, z: 7 },
    ]);

    // Two endpoints plus at most the sample cap in between.
    expect(anchors.length).toBeLessThanOrEqual(
      HUNTING_BOT_LIMITS.maxLegSamples + 2,
    );
  });

  it("drops consecutive duplicates", () => {
    const map = gridMapData({ name: "test", width: 20, height: 20, blocked: [] });

    const anchors = buildRouteAnchors(map, [
      { x: 5, y: 5, z: 7 },
      { x: 5, y: 5, z: 7 },
      { x: 6, y: 5, z: 7 },
    ]);

    expect(anchors.map((anchor) => anchor.position)).toEqual([
      { x: 5, y: 5, z: 7 },
      { x: 6, y: 5, z: 7 },
    ]);
  });
});
