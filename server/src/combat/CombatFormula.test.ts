import { describe, expect, it } from "vitest";
import { CombatFormula } from "./CombatFormula";

describe("CombatFormula", () => {
  it("produces the same rolls and formulas for the same seed", () => {
    const left = new CombatFormula(42);
    const right = new CombatFormula(42);

    expect(
      Array.from({ length: 20 }, () => left.integer(1, 100)),
    ).toEqual(
      Array.from({ length: 20 }, () => right.integer(1, 100)),
    );
    expect(
      Array.from({ length: 20 }, () => left.normalInteger(1, 100)),
    ).toEqual(
      Array.from({ length: 20 }, () => right.normalInteger(1, 100)),
    );
    expect(left.playerMeleeDamage({
      level: 30,
      skill: 55,
      attack: 28,
      vocationMultiplier: 1.1,
      fightMode: "offensive",
      fist: false,
    })).toEqual(right.playerMeleeDamage({
      level: 30,
      skill: 55,
      attack: 28,
      vocationMultiplier: 1.1,
      fightMode: "offensive",
      fist: false,
    }));
  });

  it("matches Canary weapon, hit, defense, and armor formulas", () => {
    const formula = new CombatFormula(7);

    expect(formula.playerMeleeDamage({
      level: 1,
      skill: 10,
      attack: 12,
      vocationMultiplier: 1,
      fightMode: "balanced",
      fist: false,
    })).toEqual({ minimum: 0, maximum: 8 });
    expect(formula.playerMeleeDamage({
      level: 1,
      skill: 10,
      attack: 12,
      vocationMultiplier: 1,
      fightMode: "offensive",
      fist: false,
    })).toEqual({ minimum: 0, maximum: 10 });
    expect(formula.playerMeleeDamage({
      level: 30,
      skill: 55,
      attack: 28,
      vocationMultiplier: 1,
      fightMode: "offensive",
      fist: false,
    })).toEqual({ minimum: 6, maximum: 137 });
    expect(formula.playerDistanceDamage({
      level: 30,
      skill: 55,
      attack: 28,
      vocationMultiplier: 1,
      fightMode: "balanced",
      targetIsPlayer: false,
      hasElement: false,
    })).toEqual({ minimum: 6, maximum: 110 });
    expect(formula.distanceHitChance({
      skill: 10,
      distance: 3,
      maxHitChance: 75,
    })).toBe(21);
    expect(formula.distanceHitChance({
      skill: 70,
      distance: 4,
      maxHitChance: 90,
    })).toBe(89);
    expect(formula.armorReduction(3)).toBe(1);
    expect(formula.armorReduction(4)).toBe(2);
    expect(formula.defenseReduction(10)).toBeGreaterThanOrEqual(5);
    expect(formula.defenseReduction(10)).toBeLessThanOrEqual(10);
    expect(formula.applyAbsorbPercent(5, 30)).toBe(3);
    expect(formula.applyAbsorbPercent(5, -30)).toBe(7);
  });

  it("keeps chance and integer results inside authoritative bounds", () => {
    const formula = new CombatFormula(7);

    expect(formula.chance(0)).toBe(false);
    expect(formula.chance(100)).toBe(true);
    for (let index = 0; index < 100; index++) {
      expect(formula.integer(9, 3)).toBeGreaterThanOrEqual(3);
      expect(formula.integer(9, 3)).toBeLessThanOrEqual(9);
      expect(formula.normalInteger(9, 3)).toBeGreaterThanOrEqual(3);
      expect(formula.normalInteger(9, 3)).toBeLessThanOrEqual(9);
    }
  });
});
