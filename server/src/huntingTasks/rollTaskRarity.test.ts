import { describe, expect, it } from "vitest";
import { WorldActionRng } from "../action/WorldActionRng";
import { rollTaskRarity } from "./rollTaskRarity";

describe("rollTaskRarity", () => {
  it("never lowers the star and pins 4+ to 5", () => {
    const rng = new WorldActionRng(23);
    for (let trial = 0; trial < 300; trial += 1) {
      for (let current = 1; current <= 3; current += 1) {
        const next = rollTaskRarity(current, rng);
        expect(next).toBeGreaterThan(current);
        expect(next).toBeLessThanOrEqual(5);
      }
    }
    expect(rollTaskRarity(4, rng)).toBe(5);
    expect(rollTaskRarity(5, rng)).toBe(5);
  });
});
