import { describe, expect, it } from "vitest";
import type { RarityRoll } from "./RarityRoll";
import { rollItemRarity } from "./rollItemRarity";

function fixedRoll(value: number): RarityRoll {
  return { integer: () => value };
}

const CHANCES = { uncommon: 5, rare: 1, epic: 0.2, legendary: 0.04 };

describe("rollItemRarity", () => {
  it("maps the roll onto cumulative thresholds, best grade first", () => {
    // Per-100k thresholds: legendary 40, epic +200, rare +1000, uncommon +5000.
    expect(rollItemRarity(fixedRoll(1), CHANCES)).toBe("legendary");
    expect(rollItemRarity(fixedRoll(40), CHANCES)).toBe("legendary");
    expect(rollItemRarity(fixedRoll(41), CHANCES)).toBe("epic");
    expect(rollItemRarity(fixedRoll(240), CHANCES)).toBe("epic");
    expect(rollItemRarity(fixedRoll(241), CHANCES)).toBe("rare");
    expect(rollItemRarity(fixedRoll(1_240), CHANCES)).toBe("rare");
    expect(rollItemRarity(fixedRoll(1_241), CHANCES)).toBe("uncommon");
    expect(rollItemRarity(fixedRoll(6_240), CHANCES)).toBe("uncommon");
    expect(rollItemRarity(fixedRoll(6_241), CHANCES)).toBeUndefined();
    expect(rollItemRarity(fixedRoll(100_000), CHANCES)).toBeUndefined();
  });

  it("supports fractional percentages down to 0.001", () => {
    const chances = { uncommon: 0, rare: 0, epic: 0, legendary: 0.001 };
    expect(rollItemRarity(fixedRoll(1), chances)).toBe("legendary");
    expect(rollItemRarity(fixedRoll(2), chances)).toBeUndefined();
  });

  it("never rolls when every chance is zero", () => {
    let rolled = false;
    const roll: RarityRoll = {
      integer: () => {
        rolled = true;
        return 1;
      },
    };
    expect(
      rollItemRarity(roll, { uncommon: 0, rare: 0, epic: 0, legendary: 0 }),
    ).toBeUndefined();
    expect(rolled).toBe(false);
  });
});
