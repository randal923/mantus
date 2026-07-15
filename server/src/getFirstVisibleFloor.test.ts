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

  it("keeps underground visibility on the current floor", () => {
    expect(
      getFirstVisibleFloor({ x: 10, y: 10, z: 9 }, makeMap(false)),
    ).toBe(9);
  });
});
