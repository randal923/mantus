import { describe, expect, it } from "vitest";
import { WorldActionRng } from "../action/WorldActionRng";
import {
  preyBonusPercentageFor,
  rollBonusRarity,
  rollBonusType,
} from "./preyBonusRoll";

describe("preyBonusRoll", () => {
  it("raises rarity strictly and pins 9+ to 10", () => {
    const rng = new WorldActionRng(3);
    for (let trial = 0; trial < 200; trial += 1) {
      for (let current = 1; current <= 8; current += 1) {
        const next = rollBonusRarity(current, rng);
        expect(next).toBeGreaterThan(current);
        expect(next).toBeLessThanOrEqual(10);
      }
    }
    expect(rollBonusRarity(9, rng)).toBe(10);
    expect(rollBonusRarity(10, rng)).toBe(10);
  });

  it("matches the pinned percentage formulas", () => {
    expect(preyBonusPercentageFor("damage", 1)).toBe(7);
    expect(preyBonusPercentageFor("damage", 10)).toBe(25);
    expect(preyBonusPercentageFor("defense", 1)).toBe(12);
    expect(preyBonusPercentageFor("defense", 10)).toBe(30);
    expect(preyBonusPercentageFor("experience", 1)).toBe(13);
    expect(preyBonusPercentageFor("experience", 10)).toBe(40);
    expect(preyBonusPercentageFor("loot", 5)).toBe(25);
  });

  it("guarantees a different type at rarity 10", () => {
    const rng = new WorldActionRng(5);
    for (let trial = 0; trial < 100; trial += 1) {
      expect(rollBonusType("damage", 10, rng)).not.toBe("damage");
    }
  });
});
