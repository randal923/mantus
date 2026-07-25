import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("profile intent schemas", () => {
  it("accepts well-formed profile intents", () => {
    const intents = [
      { type: "character-profile-get", name: "Bob" },
      { type: "profile-select-title", titleId: "veteran" },
      { type: "profile-select-title", titleId: null },
      { type: "bug-report", category: "bug", message: "the door is stuck" },
      { type: "bug-report", category: "map", message: "a".repeat(500) },
    ];
    for (const intent of intents) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(true);
    }
  });

  it("rejects out-of-bounds and malformed profile intents", () => {
    const rejected = [
      { type: "character-profile-get", name: "ab" },
      { type: "character-profile-get", name: "a".repeat(21) },
      { type: "profile-select-title" },
      { type: "profile-select-title", titleId: "a".repeat(65) },
      { type: "bug-report", category: "exploit", message: "hi" },
      { type: "bug-report", category: "bug", message: "" },
      { type: "bug-report", category: "bug", message: "a".repeat(501) },
      // The client never supplies the reporter or a position.
      {
        type: "bug-report",
        category: "bug",
        message: "hi",
        position: { x: 1, y: 1, z: 7 },
      },
    ];
    for (const intent of rejected) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(false);
    }
  });
});
