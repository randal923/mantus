import { describe, expect, it } from "vitest";
import {
  computeWheelBonuses,
  computeWheelSpellGrades,
  WHEEL_LIMITS,
} from "@tibia/protocol";

const emptySlices = (): number[] =>
  new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);

const withSlices = (points: Readonly<Record<number, number>>): number[] => {
  const slices = emptySlices();
  for (const [id, value] of Object.entries(points)) {
    slices[Number(id) - 1] = value;
  }
  return slices;
};

const NO_STAGES = { green: 0, red: 0, blue: 0, purple: 0 } as const;

describe("computeWheelSpellGrades", () => {
  it("grades augment spells by their filled slice pair", () => {
    // Slices 13 and 29 carry the Sorcerer's Energy Wave augment.
    expect(
      computeWheelSpellGrades(withSlices({ 13: 100 }), "Sorcerer", NO_STAGES)[
        "Energy Wave"
      ],
    ).toBe(1);
    expect(
      computeWheelSpellGrades(
        withSlices({ 13: 100, 29: 100 }),
        "Sorcerer",
        NO_STAGES,
      )["Energy Wave"],
    ).toBe(2);
    // A partially-filled slice grants nothing.
    expect(
      computeWheelSpellGrades(withSlices({ 13: 99 }), "Sorcerer", NO_STAGES)[
        "Energy Wave"
      ],
    ).toBeUndefined();
    // The same pair is the Druid's Terra Wave.
    expect(
      computeWheelSpellGrades(withSlices({ 13: 100 }), "Druid", NO_STAGES)[
        "Terra Wave"
      ],
    ).toBe(1);
  });

  it("grades revelation spells by stage, with Canary's extra-grant quirk", () => {
    const stages = { green: 0, red: 2, blue: 1, purple: 3 } as const;
    const druid = computeWheelSpellGrades(emptySlices(), "Druid", stages);
    expect(druid["Ice Burst"]).toBe(1);
    expect(druid["Terra Burst"]).toBe(1);
    expect(druid["Avatar of Nature"]).toBe(3);
    const sorcerer = computeWheelSpellGrades(emptySlices(), "Sorcerer", stages);
    expect(sorcerer["Great Death Beam"]).toBe(2);
    // Drain Body uses Canary's `i <= stage` loop: one extra grant.
    expect(sorcerer["Drain Body"]).toBe(2);
    const paladin = computeWheelSpellGrades(emptySlices(), "Paladin", stages);
    expect(paladin["Divine Empowerment"]).toBe(2);
  });

  it("derives instants from the two special slices in computeWheelBonuses", () => {
    const bonuses = computeWheelBonuses(
      withSlices({ 1: 200, 36: 200 }),
      "Master Sorcerer",
    );
    expect(bonuses.instants["Runic Mastery"]).toBe(true);
    expect(bonuses.instants["Focus Mastery"]).toBe(true);
    const partial = computeWheelBonuses(withSlices({ 1: 199 }), "Elder Druid");
    expect(partial.instants["Healing Link"]).toBeUndefined();
  });
});
