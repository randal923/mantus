import { describe, expect, it } from "vitest";
import type { AchievementEntry } from "@tibia/protocol";
import { summarizeProfileProgress } from "./summarizeProfileProgress";

function entry(overrides: Partial<AchievementEntry>): AchievementEntry {
  return {
    achievementId: "annihilator",
    name: "Annihilator",
    description: "You defeated the Annihilator.",
    grade: 2,
    points: 5,
    secret: false,
    granted: false,
    ...overrides,
  };
}

describe("summarizeProfileProgress", () => {
  it("returns zeros for an empty catalog", () => {
    expect(summarizeProfileProgress([])).toEqual({
      grantedCount: 0,
      totalCount: 0,
      grantedPoints: 0,
      totalPoints: 0,
      hiddenCount: 0,
    });
  });

  it("counts granted entries and points against the full catalog", () => {
    const summary = summarizeProfileProgress([
      entry({ achievementId: "a", points: 5, granted: true }),
      entry({ achievementId: "b", points: 3, granted: false }),
      entry({ achievementId: "c", points: 7, granted: true }),
    ]);
    expect(summary).toEqual({
      grantedCount: 2,
      totalCount: 3,
      grantedPoints: 12,
      totalPoints: 15,
      hiddenCount: 0,
    });
  });

  it("counts only ungranted secret entries as hidden", () => {
    const summary = summarizeProfileProgress([
      entry({ achievementId: "a", secret: true, granted: false }),
      entry({ achievementId: "b", secret: true, granted: true }),
      entry({ achievementId: "c", secret: false, granted: false }),
    ]);
    expect(summary.hiddenCount).toBe(1);
    expect(summary.grantedCount).toBe(1);
    expect(summary.totalCount).toBe(3);
  });
});
