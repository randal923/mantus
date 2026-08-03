import { describe, expect, it } from "vitest";
import { publicStageRates } from "./publicStageRates";
import { EXPERIENCE_STAGES } from "./stageRates";

describe("publicStageRates", () => {
  it("publishes the server's own bands with an open-ended last one", () => {
    const stages = publicStageRates(true);

    expect(stages.experience).toHaveLength(EXPERIENCE_STAGES.length);
    expect(stages.experience[0]).toEqual({
      minLevel: 1,
      maxLevel: 8,
      multiplier: 50,
    });
    expect(stages.experience.at(-1)).toEqual({
      minLevel: 1_001,
      maxLevel: null,
      multiplier: 2,
    });
    expect(stages.skill.length).toBeGreaterThan(0);
    expect(stages.magic.length).toBeGreaterThan(0);
  });

  it("advertises nothing while the server runs flat rates", () => {
    expect(publicStageRates(false)).toEqual({
      experience: [],
      skill: [],
      magic: [],
    });
  });
});
