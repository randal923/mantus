import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("guild intent schemas", () => {
  it("accepts well-formed guild intents", () => {
    const intents = [
      { type: "guild-create", name: "Red Rose" },
      { type: "guild-invite", targetName: "Bob" },
      {
        type: "guild-respond-invite",
        guildId: "00000000-0000-4000-8000-000000000001",
        accept: true,
      },
      { type: "guild-leave" },
      { type: "guild-open" },
      { type: "guild-chat", text: "hello" },
      { type: "guild-set-motd", motd: "" },
      { type: "guild-set-rank-name", level: 2, name: "Officer" },
      {
        type: "guild-declare-war",
        targetGuildName: "Blue Rose",
        fragLimit: 10,
      },
    ];
    for (const intent of intents) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(true);
    }
  });

  it("rejects out-of-bounds and malformed guild intents", () => {
    const rejected = [
      { type: "guild-create", name: "ab" },
      { type: "guild-create", name: "a".repeat(30) },
      { type: "guild-respond-invite", guildId: "not-a-uuid", accept: true },
      { type: "guild-set-motd", motd: "a".repeat(256) },
      {
        type: "guild-set-nick",
        targetCharacterId: "00000000-0000-4000-8000-000000000001",
        nick: "a".repeat(16),
      },
      { type: "guild-set-rank-name", level: 4, name: "X" },
      { type: "guild-set-rank-name", level: 1, name: "a".repeat(41) },
      { type: "guild-declare-war", targetGuildName: "Blue", fragLimit: 0 },
      { type: "guild-declare-war", targetGuildName: "Blue", fragLimit: 1001 },
      { type: "guild-chat", text: "" },
      { type: "guild-chat", text: "a".repeat(256) },
      { type: "guild-leave", extra: true },
    ];
    for (const intent of rejected) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(false);
    }
  });
});
