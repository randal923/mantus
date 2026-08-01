import { describe, expect, it } from "vitest";
import type { Position } from "@tibia/protocol";
import { resolveInteractiveTile } from "./resolveInteractiveTile";

const GROUND = {
  clientId: 429,
  width: 1,
  height: 1,
  flags: { ground: true, groundBorder: false },
};
const BORDER = {
  clientId: 4657,
  width: 1,
  height: 1,
  flags: { ground: false, groundBorder: true },
};
const DOOR_1X1 = {
  clientId: 1223,
  width: 1,
  height: 1,
  flags: { ground: false, groundBorder: false },
};
const GATE_2X2 = {
  clientId: 3494,
  width: 2,
  height: 2,
  flags: { ground: false, groundBorder: false },
};

const key = (position: Position) => `${position.x},${position.y},${position.z}`;

const world = (tiles: Record<string, ReadonlyArray<typeof GROUND>>) =>
  (position: Position) => tiles[key(position)] ?? [GROUND];

describe("resolveInteractiveTile", () => {
  it("keeps a tile whose own stack is 1x1 with no covering neighbour", () => {
    const itemsAt = world({
      "5,5,7": [GROUND, DOOR_1X1],
      "6,5,7": [GROUND, DOOR_1X1],
    });
    expect(resolveInteractiveTile({ x: 5, y: 5, z: 7 }, itemsAt)).toEqual({
      x: 5,
      y: 5,
      z: 7,
    });
  });

  it("prefers a covering multi-tile sprite over the tile's own 1x1 item", () => {
    // The 2x2 gate draws over the wall's tile, so the click means the gate.
    const itemsAt = world({
      "5,5,7": [GROUND, DOOR_1X1],
      "6,5,7": [GROUND, GATE_2X2],
    });
    expect(resolveInteractiveTile({ x: 5, y: 5, z: 7 }, itemsAt)).toEqual({
      x: 6,
      y: 5,
      z: 7,
    });
  });

  it.each([435, 21298])(
    "keeps sewer grate %i targetable beside a covering wall",
    (clientId) => {
      const sewerGrate = {
        clientId,
        width: 1,
        height: 1,
        flags: { ground: false, groundBorder: false },
      };
      const itemsAt = world({
        "5,5,7": [GROUND, sewerGrate],
        "6,5,7": [GROUND, GATE_2X2],
      });

      expect(resolveInteractiveTile({ x: 5, y: 5, z: 7 }, itemsAt)).toEqual({
        x: 5,
        y: 5,
        z: 7,
      });
    },
  );

  it("keeps the anchor tile of a multi-tile sprite on itself", () => {
    const itemsAt = world({ "5,5,7": [GROUND, GATE_2X2] });
    expect(resolveInteractiveTile({ x: 5, y: 5, z: 7 }, itemsAt)).toEqual({
      x: 5,
      y: 5,
      z: 7,
    });
  });

  it("redirects the west half of a 2x2 gate to its anchor", () => {
    const itemsAt = world({ "6,5,7": [GROUND, GATE_2X2] });
    expect(resolveInteractiveTile({ x: 5, y: 5, z: 7 }, itemsAt)).toEqual({
      x: 6,
      y: 5,
      z: 7,
    });
  });

  it("redirects the north and diagonal quarters to the anchor", () => {
    const itemsAt = world({ "6,6,7": [GROUND, GATE_2X2] });
    expect(resolveInteractiveTile({ x: 6, y: 5, z: 7 }, itemsAt)).toEqual({
      x: 6,
      y: 6,
      z: 7,
    });
    expect(resolveInteractiveTile({ x: 5, y: 5, z: 7 }, itemsAt)).toEqual({
      x: 6,
      y: 6,
      z: 7,
    });
  });

  it("ignores 1x1 neighbours and ground borders", () => {
    const itemsAt = world({
      "5,5,7": [GROUND, BORDER],
      "6,5,7": [GROUND, DOOR_1X1],
    });
    expect(resolveInteractiveTile({ x: 5, y: 5, z: 7 }, itemsAt)).toEqual({
      x: 5,
      y: 5,
      z: 7,
    });
  });

  it("does not treat a wide-but-flat sprite as covering the row above", () => {
    const wide = {
      clientId: 999,
      width: 2,
      height: 1,
      flags: { ground: false, groundBorder: false },
    };
    const itemsAt = world({ "6,6,7": [GROUND, wide] });
    expect(resolveInteractiveTile({ x: 6, y: 5, z: 7 }, itemsAt)).toEqual({
      x: 6,
      y: 5,
      z: 7,
    });
    expect(resolveInteractiveTile({ x: 5, y: 6, z: 7 }, itemsAt)).toEqual({
      x: 6,
      y: 6,
      z: 7,
    });
  });
});
