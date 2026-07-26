import { describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { Player } from "../Player";
import type { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import type { QuestDefinition } from "./QuestDefinition";
import { QuestService } from "./QuestService";

const CATALOG: ReadonlyArray<QuestDefinition> = [
  {
    questId: 1,
    name: "The Queen of the Banshees",
    startStorageKey: "Quest.Banshees.Line",
    startStorageValue: 1,
    missions: [
      {
        missionId: 1,
        name: "The First Seal",
        storageKey: "Quest.Banshees.Line",
        startValue: 1,
        endValue: 7,
        description: "Break the seals.",
      },
    ],
  },
  {
    questId: 2,
    name: "Hidden Quest",
    startStorageKey: "Quest.Hidden.Line",
    startStorageValue: 1,
    missions: [
      {
        missionId: 1,
        name: "Hidden Mission",
        storageKey: "Quest.Hidden.Line",
        startValue: 1,
        endValue: 2,
        description: "Never shown before it starts.",
      },
    ],
  },
];

function harness() {
  const persistence = { markDirty: vi.fn() } as unknown as CharacterPersistence;
  const service = new QuestService(
    persistence,
    { canonicalOf: (key) => key, size: 0 },
    CATALOG,
  );
  const player = new Player(makeCharacter("hero"), { x: 0, y: 0, z: 7 }, 0);
  const sent: ServerMessage[] = [];
  const session = {
    playerId: player.id,
    send: (message: ServerMessage) => {
      sent.push(message);
    },
  } as unknown as Session;
  return { service, player, session, sent };
}

describe("QuestService quest log", () => {
  it("lists only started quests, never the rest of the catalog", () => {
    const { service, player, session, sent } = harness();
    service.setStorageValue(player, "Quest.Banshees.Line", 2);
    service.handleLogGet(session, player, 1_000);
    expect(sent).toEqual([
      {
        type: "quest-log",
        quests: [
          { questId: 1, name: "The Queen of the Banshees", completed: false },
        ],
      },
    ]);
  });

  it("refuses a quest line for an unstarted quest", () => {
    const { service, player, session, sent } = harness();
    service.handleLineGet(
      session,
      player,
      { type: "quest-line-get", questId: 2 },
      1_000,
    );
    expect(sent).toEqual([
      { type: "quest-log-failed", reason: "invalid-request" },
    ]);
  });

  it("projects started missions with live descriptions and completion", () => {
    const { service, player, session, sent } = harness();
    service.setStorageValue(player, "Quest.Banshees.Line", 7);
    service.handleLineGet(
      session,
      player,
      { type: "quest-line-get", questId: 1 },
      1_000,
    );
    expect(sent).toEqual([
      {
        type: "quest-line",
        questId: 1,
        name: "The Queen of the Banshees",
        missions: [
          {
            missionId: 1,
            name: "The First Seal",
            completed: true,
            description: "Break the seals.",
          },
        ],
      },
    ]);
  });

  it("rate-limits rapid log requests per session", () => {
    const { service, player, session, sent } = harness();
    service.handleLogGet(session, player, 1_000);
    service.handleLogGet(session, player, 1_100);
    expect(sent[1]).toEqual({
      type: "quest-log-failed",
      reason: "rate-limited",
    });
  });
});
