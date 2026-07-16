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
    expect(left.playerDamage({
      level: 30,
      skill: 55,
      attack: 28,
      vocationMultiplier: 1.1,
      fightMultiplier: 1.15,
    })).toEqual(right.playerDamage({
      level: 30,
      skill: 55,
      attack: 28,
      vocationMultiplier: 1.1,
      fightMultiplier: 1.15,
    }));
  });

  it("keeps chance and integer results inside authoritative bounds", () => {
    const formula = new CombatFormula(7);

    expect(formula.chance(0)).toBe(false);
    expect(formula.chance(100)).toBe(true);
    for (let index = 0; index < 100; index++) {
      expect(formula.integer(9, 3)).toBeGreaterThanOrEqual(3);
      expect(formula.integer(9, 3)).toBeLessThanOrEqual(9);
    }
  });
});
