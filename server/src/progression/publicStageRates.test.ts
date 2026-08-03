import { describe, expect, it } from "vitest";
import { publicStageRates } from "./publicStageRates";
import { NO_STAGES, type StageTables } from "./stageRates";

const STAGES: StageTables = {
  experience: [
    { minLevel: 1, maxLevel: 8, multiplier: 50 },
    { minLevel: 9, multiplier: 2 },
  ],
  skill: [{ minLevel: 10, multiplier: 15 }],
  magic: [{ minLevel: 0, multiplier: 10 }],
};

describe("publicStageRates", () => {
  it("publishes the server's own bands with an open-ended last one", () => {
    const stages = publicStageRates(STAGES);

    expect(stages.experience).toEqual([
      { minLevel: 1, maxLevel: 8, multiplier: 50 },
      { minLevel: 9, maxLevel: null, multiplier: 2 },
    ]);
    expect(stages.skill).toHaveLength(1);
    expect(stages.magic).toHaveLength(1);
  });

  it("advertises nothing while the server runs flat rates", () => {
    expect(publicStageRates(NO_STAGES)).toEqual({
      experience: [],
      skill: [],
      magic: [],
    });
  });
});
