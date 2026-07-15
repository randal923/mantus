import { describe, expect, it } from "vitest";
import { getFirstVisibleFloor } from "./getFirstVisibleFloor";

describe("getFirstVisibleFloor", () => {
  it("shows every upper floor when nothing blocks the view", () => {
    expect(
      getFirstVisibleFloor(
        100,
        200,
        7,
        () => true,
        () => false,
      ),
    ).toBe(0);
  });

  it("checks the perspective-shifted tile above the player", () => {
    const blocking = new Set(["6:101,201"]);
    const firstVisible = getFirstVisibleFloor(
      100,
      200,
      7,
      () => true,
      (floor, x, y) => blocking.has(`${floor}:${x},${y}`),
    );

    expect(firstVisible).toBe(7);
  });

  it("keeps floors below the highest blocker hidden", () => {
    const blocking = new Set(["4:103,203", "6:100,199"]);
    const firstVisible = getFirstVisibleFloor(
      100,
      200,
      7,
      () => true,
      (floor, x, y) => blocking.has(`${floor}:${x},${y}`),
    );

    expect(firstVisible).toBe(7);
  });

  it("does not let an opaque neighboring wall hide the whole upper floor", () => {
    const firstVisible = getFirstVisibleFloor(
      100,
      200,
      7,
      (_floor, x, y) => x === 100 && y === 200,
      (floor, x, y) => floor === 6 && x === 101 && y === 200,
    );

    expect(firstVisible).toBe(0);
  });
});
