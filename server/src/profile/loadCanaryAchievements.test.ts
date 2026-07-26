import { describe, expect, it } from "vitest";
import { achievementEntrySchema } from "@tibia/protocol";
import { ACHIEVEMENTS } from "./achievementCatalog";
import { loadCanaryAchievements } from "./loadCanaryAchievements";

describe("loadCanaryAchievements", () => {
  it("loads the full pinned catalog with valid protocol-shaped entries", () => {
    const achievements = loadCanaryAchievements();
    expect(achievements).toHaveLength(541);
    for (const definition of achievements) {
      const parsed = achievementEntrySchema.safeParse({
        achievementId: definition.achievementId,
        name: definition.name,
        description: definition.description,
        grade: definition.grade,
        points: definition.points,
        secret: definition.secret === true,
        granted: false,
      });
      expect(parsed.success, definition.achievementId).toBe(true);
    }
  });

  it("keeps known entries intact", () => {
    const byId = new Map(
      loadCanaryAchievements().map((definition) => [
        definition.achievementId,
        definition,
      ]),
    );
    expect(byId.get("castlemania")).toMatchObject({
      name: "Castlemania",
      grade: 2,
      points: 5,
      secret: true,
    });
    expect(byId.get("soul-mender")).toMatchObject({ grade: 4, points: 10 });
  });

  it("merges into the catalog without shadowing pinned mantus ids", () => {
    // 7 pinned + 541 imported; the merged map throwing at import time would
    // fail this suite outright, so reaching here already proves no shadowing.
    expect(ACHIEVEMENTS.size).toBe(548);
    expect(ACHIEVEMENTS.get("landlord")?.points).toBe(2);
    expect(ACHIEVEMENTS.get("annihilator")?.name).toBe("Annihilator");
  });
});
