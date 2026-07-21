import { describe, expect, it } from "vitest";
import { canSee } from "./canSee";

const RANGE = { x: 9, y: 7 };

describe("canSee", () => {
  it("sees a player on the exact edge of the range", () => {
    expect(canSee({ x: 0, y: 0, z: 7 }, { x: 9, y: 7, z: 7 }, RANGE)).toBe(true);
    expect(canSee({ x: 0, y: 0, z: 7 }, { x: -9, y: -7, z: 7 }, RANGE)).toBe(true);
  });

  it("does not see a player one tile beyond the range", () => {
    expect(canSee({ x: 0, y: 0, z: 7 }, { x: 10, y: 0, z: 7 }, RANGE)).toBe(false);
    expect(canSee({ x: 0, y: 0, z: 7 }, { x: 0, y: 8, z: 7 }, RANGE)).toBe(false);
  });

  it("is symmetric", () => {
    const a = { x: 3, y: 5, z: 7 };
    const b = { x: 12, y: 11, z: 7 };
    expect(canSee(a, b, RANGE)).toBe(canSee(b, a, RANGE));
  });

  it("does not reveal an upper floor when cover limits visibility", () => {
    expect(
      canSee({ x: 3, y: 5, z: 7 }, { x: 3, y: 5, z: 6 }, RANGE),
    ).toBe(false);
  });

  it("sees the ground floor from an elevated surface viewer", () => {
    expect(
      canSee({ x: 10, y: 10, z: 6 }, { x: 9, y: 9, z: 7 }, RANGE, 0),
    ).toBe(true);
    expect(
      canSee({ x: 10, y: 10, z: 5 }, { x: 30, y: 10, z: 7 }, RANGE, 0),
    ).toBe(false);
  });

  it("never reveals other floors underground", () => {
    expect(
      canSee({ x: 10, y: 10, z: 9 }, { x: 10, y: 10, z: 10 }, RANGE, 9),
    ).toBe(false);
  });

  it("projects an authorized upper floor into the viewer range", () => {
    expect(
      canSee({ x: 10, y: 10, z: 7 }, { x: 11, y: 11, z: 6 }, RANGE, 6),
    ).toBe(true);
    expect(
      canSee({ x: 10, y: 10, z: 8 }, { x: 10, y: 10, z: 7 }, RANGE, 7),
    ).toBe(false);
  });
});
