import { describe, expect, it } from "vitest";
import type { CreatureState, Position } from "@tibia/protocol";
import { drawMinimap } from "./drawMinimap";
import type { MinimapRegionStore } from "./MinimapRegionStore";

interface RegionDraw {
  region: { z: number; rx: number; ry: number };
  args: number[];
}

function stubCanvas(size: number) {
  const regionDraws: RegionDraw[] = [];
  const context = {
    setTransform: () => {},
    fillRect: () => {},
    drawImage: (image: RegionDraw["region"], ...args: number[]) =>
      regionDraws.push({ region: image, args }),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    imageSmoothingEnabled: true,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };
  const canvas = {
    width: size,
    height: size,
    clientWidth: size,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return { canvas, regionDraws };
}

const store = {
  regionSize: 256,
  regionImage: (z: number, rx: number, ry: number) => ({ z, rx, ry }),
} as unknown as MinimapRegionStore;

const ownPosition: Position = { x: 32069, y: 31901, z: 6 };

const npc = {
  id: "npc-1",
  kind: "npc",
  name: "Sam",
  position: { x: 32079, y: 31901, z: 6 },
} as CreatureState;

describe("drawMinimap", () => {
  it("tiles adjacent regions without seams", () => {
    const { canvas, regionDraws } = stubCanvas(200);
    drawMinimap({
      canvas,
      store,
      center: { x: ownPosition.x, y: ownPosition.y },
      floor: 6,
      pixelsPerTile: 1,
      creatures: [],
      ownPlayerId: "player",
      ownPosition,
    });
    expect(regionDraws.length).toBe(4);
    const left = regionDraws.find(
      (draw) => draw.region.rx === 124 && draw.region.ry === 124,
    );
    const right = regionDraws.find(
      (draw) => draw.region.rx === 125 && draw.region.ry === 124,
    );
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    // The right edge of region 124 must meet the left edge of region 125.
    expect(left!.args[0] + left!.args[2]).toBe(right!.args[0]);
  });

  it("projects creature markers into canvas pixels and centers the player", () => {
    const { canvas } = stubCanvas(200);
    const markers = drawMinimap({
      canvas,
      store,
      center: { x: ownPosition.x, y: ownPosition.y },
      floor: 6,
      pixelsPerTile: 4,
      creatures: [npc],
      ownPlayerId: "player",
      ownPosition,
    });
    expect(markers).toEqual([{ x: 140, y: 100, creature: npc }]);
  });

  it("skips creatures on other floors and the own player marker entry", () => {
    const { canvas } = stubCanvas(200);
    const markers = drawMinimap({
      canvas,
      store,
      center: { x: ownPosition.x, y: ownPosition.y },
      floor: 7,
      pixelsPerTile: 4,
      creatures: [npc, { ...npc, id: "player" }],
      ownPlayerId: "player",
      ownPosition,
    });
    expect(markers).toEqual([]);
  });
});
