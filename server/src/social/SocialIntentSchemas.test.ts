import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("social intent schemas", () => {
  it("accepts well-formed vip, highscore, and report intents", () => {
    const intents = [
      { type: "vip-add", name: "Bob" },
      { type: "vip-remove", targetCharacterId: "some-id" },
      {
        type: "vip-edit",
        targetCharacterId: "some-id",
        description: "hunt buddy",
        icon: 3,
        notifyLogin: true,
      },
      { type: "vip-edit", targetCharacterId: "some-id" },
      { type: "highscores-get", category: "experience", page: 0 },
      {
        type: "highscores-get",
        category: "sword",
        vocation: "Knight",
        page: 19,
      },
      {
        type: "report-player",
        targetName: "Bob",
        reason: "botting",
        comment: "",
      },
      {
        type: "report-player",
        targetName: "Bob",
        reason: "other",
        comment: "a".repeat(500),
      },
    ];
    for (const intent of intents) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(true);
    }
  });

  it("rejects out-of-bounds and malformed social intents", () => {
    const rejected = [
      { type: "vip-add", name: "ab" },
      { type: "vip-add", name: "a".repeat(21) },
      { type: "vip-edit", targetCharacterId: "x", icon: 11 },
      { type: "vip-edit", targetCharacterId: "x", description: "a".repeat(129) },
      { type: "vip-remove", targetCharacterId: "" },
      // Category is an enum: raw SQL fragments cannot pass validation.
      { type: "highscores-get", category: "experience; DROP TABLE", page: 0 },
      { type: "highscores-get", category: "experience", page: 20 },
      { type: "highscores-get", category: "experience", page: -1 },
      { type: "highscores-get", category: "experience", page: 0, extra: 1 },
      {
        type: "highscores-get",
        category: "experience",
        vocation: "GameMaster",
        page: 0,
      },
      { type: "report-player", targetName: "Bob", reason: "invalid", comment: "" },
      {
        type: "report-player",
        targetName: "Bob",
        reason: "abuse",
        comment: "a".repeat(501),
      },
      { type: "report-player", targetName: "", reason: "abuse", comment: "" },
    ];
    for (const intent of rejected) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(false);
    }
  });
});
