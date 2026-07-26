import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("hunting task intent schemas", () => {
  it("accepts well-formed task actions", () => {
    const intents = [
      { type: "hunting-task-action", slot: 0, action: "list-reroll" },
      { type: "hunting-task-action", slot: 1, action: "star-reroll" },
      { type: "hunting-task-action", slot: 2, action: "wildcard-list" },
      {
        type: "hunting-task-action",
        slot: 0,
        action: "select-monster",
        raceId: 21,
        upgrade: true,
      },
      { type: "hunting-task-action", slot: 0, action: "cancel" },
      { type: "hunting-task-action", slot: 0, action: "claim" },
    ];
    for (const intent of intents) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(true);
    }
  });

  it("rejects out-of-bounds and malformed task actions", () => {
    const rejected = [
      { type: "hunting-task-action", slot: 3, action: "claim" },
      { type: "hunting-task-action", slot: 0, action: "grant-points" },
      {
        type: "hunting-task-action",
        slot: 0,
        action: "select-monster",
        raceId: 0,
      },
      {
        type: "hunting-task-action",
        slot: 0,
        action: "select-monster",
        raceId: 70_000,
      },
      // No client-supplied kill counts or rewards, ever.
      { type: "hunting-task-action", slot: 0, action: "claim", kills: 400 },
      { type: "hunting-task-action", slot: 0, action: "claim", points: 999 },
    ];
    for (const intent of rejected) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(false);
    }
  });
});
