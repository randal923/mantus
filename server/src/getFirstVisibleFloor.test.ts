import { describe, expect, it } from "vitest";
import type { MapData } from "./MapData";
import { getFirstVisibleFloor } from "./getFirstVisibleFloor";

const makeMap = (covered: boolean): MapData => ({
  name: "visibility",
  spawn: { x: 10, y: 10, z: 7 },
  getTile(position) {
    const isCover =
      covered && position.x === 10 && position.y === 10 && position.z === 6;
    if (position.z !== 7 && !isCover) return undefined;
    return {
      walkable: true,
      pathable: true,
      groundSpeed: 150,
      blocksProjectile: false,
      limitsFloorView: isCover,
      limitsFloorViewFree: isCover,
      protectionZone: false,
      noPvpZone: false,
      noLogoutZone: false,
      pvpZone: false,
    };
  },
  isWalkable(position) {
    return this.getTile(position)?.walkable ?? false;
  },
  getGroundSpeed(position) {
    return this.getTile(position)?.groundSpeed;
  },
  blocksProjectile(position) {
    return this.getTile(position)?.blocksProjectile ?? true;
  },
  getTransition() {
    return undefined;
  },
  getAction() {
    return undefined;
  },
  getItems() {
    return [];
  },
});

// Underground map: solid floors at z 8..11, with an optional roof on floor 8
// directly above a z=9 viewer at (10, 10).
const undergroundMap = (covered: boolean): MapData => ({
  ...makeMap(false),
  getTile(position) {
    if (position.z < 8 || position.z > 11) return undefined;
    const isRoof =
      covered && position.z === 8 && position.x === 10 && position.y === 10;
    return {
      walkable: true,
      pathable: true,
      groundSpeed: 150,
      blocksProjectile: false,
      limitsFloorView: isRoof,
      limitsFloorViewFree: isRoof,
      protectionZone: false,
      noPvpZone: false,
      noLogoutZone: false,
      pvpZone: false,
    };
  },
});

describe("getFirstVisibleFloor", () => {
  it("allows upper surface floors through an open shaft", () => {
    expect(
      getFirstVisibleFloor({ x: 10, y: 10, z: 7 }, makeMap(false)),
    ).toBe(0);
  });

  it("stops at the first covering upper floor", () => {
    expect(
      getFirstVisibleFloor({ x: 10, y: 10, z: 7 }, makeMap(true)),
    ).toBe(7);
  });

  it("extends underground visibility up through an open shaft", () => {
    // z=9 viewer with no roof above sees one floor up (to the aware top, 8).
    expect(
      getFirstVisibleFloor({ x: 10, y: 10, z: 9 }, undergroundMap(false)),
    ).toBe(8);
  });

  it("stops underground visibility at a covering upper floor", () => {
    // A roof on floor 8 directly above keeps the viewer on its own floor.
    expect(
      getFirstVisibleFloor({ x: 10, y: 10, z: 9 }, undergroundMap(true)),
    ).toBe(9);
  });
});
