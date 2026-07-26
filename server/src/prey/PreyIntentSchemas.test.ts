import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("prey intent schemas", () => {
  it("accepts well-formed prey actions", () => {
    const intents = [
      { type: "prey-action", slot: 0, action: "list-reroll" },
      { type: "prey-action", slot: 1, action: "bonus-reroll" },
      { type: "prey-action", slot: 2, action: "select-monster", index: 8 },
      { type: "prey-action", slot: 0, action: "wildcard-list" },
      { type: "prey-action", slot: 0, action: "wildcard-select", raceId: 21 },
      { type: "prey-action", slot: 0, action: "set-option", option: "lock" },
      { type: "prey-action", slot: 0, action: "set-option", option: "none" },
    ];
    for (const intent of intents) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(true);
    }
  });

  it("rejects out-of-bounds and malformed prey actions", () => {
    const rejected = [
      { type: "prey-action", slot: 3, action: "list-reroll" },
      { type: "prey-action", slot: -1, action: "list-reroll" },
      { type: "prey-action", slot: 0, action: "steal-bonus" },
      { type: "prey-action", slot: 0, action: "select-monster", index: 9 },
      { type: "prey-action", slot: 0, action: "select-monster", index: -1 },
      { type: "prey-action", slot: 0, action: "wildcard-select", raceId: 0 },
      {
        type: "prey-action",
        slot: 0,
        action: "wildcard-select",
        raceId: 70_000,
      },
      { type: "prey-action", slot: 0, action: "set-option", option: "free" },
      // No client-supplied bonus values, ever.
      {
        type: "prey-action",
        slot: 0,
        action: "bonus-reroll",
        percentage: 40,
      },
    ];
    for (const intent of rejected) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(false);
    }
  });
});
