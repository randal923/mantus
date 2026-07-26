import { describe, expect, it } from "vitest";
import { loadQuestCatalog } from "./loadQuestCatalog";
import { loadQuestStorageAliases } from "./loadQuestStorageAliases";
import { questIsStarted, missionIsStarted } from "./evaluateQuestState";

// Feature 105 parity gate: the generated quest catalog must load fail-closed
// and keep the pinned counts. A regenerated import that drops or invents
// entries fails here, not in production.

describe("quest catalog parity", () => {
  it("loads the pinned catalog with exactly the imported counts", () => {
    const quests = loadQuestCatalog();
    expect(quests).toHaveLength(51);
    const missions = quests.reduce(
      (total, quest) => total + quest.missions.length,
      0,
    );
    expect(missions).toBe(456);
  });

  it("keeps quest 1 exactly as pinned (The Queen of the Banshees)", () => {
    const quest = loadQuestCatalog().find((entry) => entry.questId === 1);
    expect(quest).toBeDefined();
    expect(quest!.name).toBe("The Queen of the Banshees");
    expect(quest!.startStorageKey).toBe(
      "Quest.U7_2.TheQueenOfTheBanshees.FirstSeal",
    );
    expect(quest!.startStorageValue).toBe(1);
    expect(quest!.missions).toHaveLength(8);
    expect(quest!.missions[0]).toMatchObject({
      missionId: 1,
      name: "The Hidden Seal",
      startValue: 1,
      endValue: 1,
      description: "You broke the first seal.",
    });
  });

  it("evaluates every pinned quest without throwing on empty storages", () => {
    const quests = loadQuestCatalog();
    const empty = () => -1;
    for (const quest of quests) {
      expect(questIsStarted(quest, empty)).toBe(false);
      for (const mission of quest.missions) {
        expect(missionIsStarted(quest, mission, empty)).toBe(false);
      }
    }
  });

  it("loads the alias map (currently empty at this pin)", () => {
    const aliases = loadQuestStorageAliases();
    expect(aliases.size).toBe(0);
    expect(aliases.canonicalOf("Quest.U7_2.TheQueenOfTheBanshees.FirstSeal")).toBe(
      "Quest.U7_2.TheQueenOfTheBanshees.FirstSeal",
    );
  });
});
