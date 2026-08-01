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
  let arcCount = 0;
  let lineCount = 0;
  let globalAlpha = 1;
  const strokeAlphas: number[] = [];
  const lineDashes: number[][] = [];
  const movePoints: Array<{ x: number; y: number }> = [];
  const context = {
    setTransform: () => {},
    fillRect: () => {},
    drawImage: (image: RegionDraw["region"], ...args: number[]) =>
      regionDraws.push({ region: image, args }),
    beginPath: () => {},
    moveTo: (x: number, y: number) => movePoints.push({ x, y }),
    lineTo: () => {
      lineCount += 1;
    },
    closePath: () => {},
    arc: () => {
      arcCount += 1;
    },
    fill: () => {},
    stroke: () => strokeAlphas.push(globalAlpha),
    strokeText: () => {},
    fillText: () => {},
    setLineDash: (dash: number[]) => lineDashes.push(dash),
    imageSmoothingEnabled: true,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value: number) {
      globalAlpha = value;
    },
  };
  const canvas = {
    width: size,
    height: size,
    clientWidth: size,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return {
    canvas,
    regionDraws,
    arcCount: () => arcCount,
    lineCount: () => lineCount,
    strokeAlphas,
    lineDashes,
    movePoints,
  };
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

  it("can render terrain without an own-player marker", () => {
    const { canvas, arcCount } = stubCanvas(200);
    drawMinimap({
      canvas,
      store,
      center: { x: ownPosition.x, y: ownPosition.y },
      floor: 6,
      pixelsPerTile: 4,
      creatures: [],
      ownPlayerId: "",
      ownPosition: null,
    });
    expect(arcCount()).toBe(0);
  });

  it("draws a tracked guide route only on its matching floor", () => {
    const matching = stubCanvas(200);
    drawMinimap({
      canvas: matching.canvas,
      store,
      center: { x: ownPosition.x, y: ownPosition.y },
      floor: 6,
      pixelsPerTile: 4,
      creatures: [],
      ownPlayerId: "",
      ownPosition: null,
      route: {
        name: "Test Hunt",
        coordinates: {
          6: [[ownPosition, { x: ownPosition.x + 5, y: ownPosition.y, z: 6 }]],
        },
      },
    });
    expect(matching.lineCount()).toBe(1);

    const otherFloor = stubCanvas(200);
    drawMinimap({
      canvas: otherFloor.canvas,
      store,
      center: { x: ownPosition.x, y: ownPosition.y },
      floor: 7,
      pixelsPerTile: 4,
      creatures: [],
      ownPlayerId: "",
      ownPosition: null,
      route: {
        name: "Test Hunt",
        coordinates: {
          6: [[ownPosition, { x: ownPosition.x + 5, y: ownPosition.y, z: 6 }]],
        },
      },
    });
    expect(otherFloor.lineCount()).toBe(0);
  });

  it("applies pulse opacity to route lines without dimming its markers", () => {
    const result = stubCanvas(200);
    drawMinimap({
      canvas: result.canvas,
      store,
      center: { x: ownPosition.x, y: ownPosition.y },
      floor: 6,
      pixelsPerTile: 4,
      creatures: [],
      ownPlayerId: "",
      ownPosition: null,
      route: {
        name: "Test Hunt",
        coordinates: {
          6: [[ownPosition, { x: ownPosition.x + 5, y: ownPosition.y, z: 6 }]],
        },
      },
      routeOpacity: 0.2,
    });

    expect(result.strokeAlphas.slice(0, 2)).toEqual([0.2, 0.2]);
    expect(result.strokeAlphas.slice(2)).toEqual([1, 1]);
  });

  it("starts the current-floor dotted route at the character position", () => {
    const result = stubCanvas(200);
    drawMinimap({
      canvas: result.canvas,
      store,
      center: { x: ownPosition.x, y: ownPosition.y },
      floor: ownPosition.z,
      pixelsPerTile: 4,
      creatures: [],
      ownPlayerId: "player",
      ownPosition,
      route: {
        name: "Test Hunt",
        coordinates: {
          6: [[
            { x: ownPosition.x - 10, y: ownPosition.y, z: 6 },
            { x: ownPosition.x + 5, y: ownPosition.y, z: 6 },
          ]],
        },
      },
    });

    expect(result.movePoints[0]).toEqual({ x: 100, y: 100 });
    expect(result.lineDashes[0]).toEqual([1.4, 6]);
    expect(result.lineDashes.at(-1)).toEqual([]);
  });
});
