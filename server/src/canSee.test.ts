import { describe, expect, it } from "vitest";
import { canSee } from "./canSee";

const RANGE = { x: 9, y: 7 };

describe("canSee", () => {
  it("sees a player on the exact edge of the range", () => {
    expect(canSee({ x: 0, y: 0 }, { x: 9, y: 7 }, RANGE)).toBe(true);
    expect(canSee({ x: 0, y: 0 }, { x: -9, y: -7 }, RANGE)).toBe(true);
  });

  it("does not see a player one tile beyond the range", () => {
    expect(canSee({ x: 0, y: 0 }, { x: 10, y: 0 }, RANGE)).toBe(false);
    expect(canSee({ x: 0, y: 0 }, { x: 0, y: 8 }, RANGE)).toBe(false);
  });

  it("is symmetric", () => {
    const a = { x: 3, y: 5 };
    const b = { x: 12, y: 11 };
    expect(canSee(a, b, RANGE)).toBe(canSee(b, a, RANGE));
  });
});
