import { describe, expect, it } from "vitest";
import type { QuestDefinition } from "./QuestDefinition";
import {
  missionDescription,
  missionIsCompleted,
  missionIsStarted,
  questIsCompleted,
  questIsStarted,
} from "./evaluateQuestState";

const QUEST: QuestDefinition = {
  questId: 1,
  name: "The Paradox Tower",
  startStorageKey: "Quest.ParadoxTower.Line",
  startStorageValue: 1,
  missions: [
    {
      missionId: 1,
      name: "The Riddler",
      storageKey: "Quest.ParadoxTower.Riddler",
      startValue: 1,
      endValue: 3,
      states: [
        { value: 1, description: "Find the riddler." },
        { value: 2, description: "Answer his questions." },
        { value: 3, description: "You solved the riddles." },
      ],
    },
    {
      missionId: 2,
      name: "The Mathemagics",
      storageKey: "Quest.ParadoxTower.Math",
      startValue: 1,
      endValue: 2,
      ignoreEndValue: true,
      description: "Solve the paradox.",
    },
  ],
};

function reader(values: Record<string, number>) {
  return (key: string) => values[key] ?? -1;
}

describe("evaluateQuestState (Canary quests.lua:1005-1156)", () => {
  it("starts a quest only at the pinned start value", () => {
    expect(questIsStarted(QUEST, reader({}))).toBe(false);
    expect(
      questIsStarted(QUEST, reader({ "Quest.ParadoxTower.Line": 0 })),
    ).toBe(false);
    expect(
      questIsStarted(QUEST, reader({ "Quest.ParadoxTower.Line": 1 })),
    ).toBe(true);
  });

  it("bounds mission started by the value window unless ignoreEndValue", () => {
    const mission = QUEST.missions[0]!;
    expect(
      missionIsStarted(QUEST, mission, reader({ "Quest.ParadoxTower.Riddler": 4 })),
    ).toBe(false);
    const openEnded = QUEST.missions[1]!;
    expect(
      missionIsStarted(QUEST, openEnded, reader({ "Quest.ParadoxTower.Math": 99 })),
    ).toBe(true);
  });

  it("completes missions at endValue and quests when every mission is done", () => {
    const read = reader({
      "Quest.ParadoxTower.Riddler": 3,
      "Quest.ParadoxTower.Math": 2,
    });
    expect(missionIsCompleted(QUEST.missions[0]!, read)).toBe(true);
    expect(questIsCompleted(QUEST, read)).toBe(true);
    expect(
      questIsCompleted(
        QUEST,
        reader({ "Quest.ParadoxTower.Riddler": 3, "Quest.ParadoxTower.Math": 1 }),
      ),
    ).toBe(false);
  });

  it("honors the quest end-storage override when present", () => {
    const overridden: QuestDefinition = {
      ...QUEST,
      endStorageKey: "Quest.ParadoxTower.Done",
      endStorageValue: 1,
    };
    expect(
      questIsCompleted(overridden, reader({ "Quest.ParadoxTower.Done": 1 })),
    ).toBe(true);
    expect(questIsCompleted(overridden, reader({}))).toBe(false);
  });

  it("resolves state descriptions by exact value with the ignoreEndValue clamp", () => {
    const mission = QUEST.missions[0]!;
    expect(
      missionDescription(mission, reader({ "Quest.ParadoxTower.Riddler": 2 })),
    ).toBe("Answer his questions.");
    const clamped = { ...mission, ignoreEndValue: true };
    expect(
      missionDescription(clamped, reader({ "Quest.ParadoxTower.Riddler": 9 })),
    ).toBe("You solved the riddles.");
    expect(
      missionDescription(mission, reader({ "Quest.ParadoxTower.Riddler": 9 })),
    ).toBe("An error has occurred, please contact a gamemaster.");
  });

  it("hides a completed mission once a later one started when flagged", () => {
    const hidden: QuestDefinition = {
      ...QUEST,
      missions: [
        { ...QUEST.missions[0]!, hideWhenNextStarted: true },
        QUEST.missions[1]!,
      ],
    };
    const read = reader({
      "Quest.ParadoxTower.Riddler": 3,
      "Quest.ParadoxTower.Math": 1,
    });
    expect(missionIsStarted(hidden, hidden.missions[0]!, read)).toBe(false);
    const aloneRead = reader({ "Quest.ParadoxTower.Riddler": 3 });
    expect(missionIsStarted(hidden, hidden.missions[0]!, aloneRead)).toBe(true);
  });
});
