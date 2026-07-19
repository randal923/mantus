import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

const itemId = randomUUID();

describe("trade intent schemas", () => {
  it("accepts a bounded trade-request only", () => {
    const message = {
      type: "trade-request",
      targetPlayerId: "player-b",
      itemId,
      revision: 1,
    };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ ...message, revision: 0 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, revision: 1.5 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, targetPlayerId: "" })
        .success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        targetPlayerId: "x".repeat(193),
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        itemId: "1; DROP TABLE items;--",
      }).success,
    ).toBe(false);
  });

  it("rejects extra fields on strict trade intents", () => {
    expect(
      clientMessageSchema.safeParse({ type: "trade-accept" }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({ type: "trade-cancel" }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({ type: "trade-accept", itemId }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId,
        revision: 1,
        count: 100,
      }).success,
    ).toBe(false);
  });
});
