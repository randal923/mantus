import { describe, expect, it } from "vitest";
import {
  computeExerciseTrainingGain,
  exerciseTrainingIntervalMs,
} from "./exerciseTraining";

describe("computeExerciseTrainingGain", () => {
  it("grants seven weapon tries per tick on a basic dummy", () => {
    expect(
      computeExerciseTrainingGain({ target: "sword", dummyRate: 100 }),
    ).toEqual({ skill: "sword", skillTries: 7, magicManaSpent: 0 });
  });

  it("grants 600 mana-spent per tick for a magic exercise weapon", () => {
    expect(
      computeExerciseTrainingGain({ target: "magic", dummyRate: 100 }),
    ).toEqual({ skill: null, skillTries: 0, magicManaSpent: 600 });
  });

  it("scales by the expert dummy rate", () => {
    expect(
      computeExerciseTrainingGain({ target: "magic", dummyRate: 110 }),
    ).toEqual({ skill: null, skillTries: 0, magicManaSpent: 660 });
  });

  it("scales by the configured exercise-training rate", () => {
    expect(
      computeExerciseTrainingGain({
        target: "sword",
        dummyRate: 100,
        rate: 2,
      }).skillTries,
    ).toBe(14);
  });
});

describe("exerciseTrainingIntervalMs", () => {
  it("uses the base attack speed divided by the rate", () => {
    expect(exerciseTrainingIntervalMs(2_000, 1)).toBe(2_000);
    expect(exerciseTrainingIntervalMs(2_000, 2)).toBe(1_000);
  });
});
