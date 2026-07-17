import { describe, expect, it } from "vitest";
import { BANK_LIMITS, clientMessageSchema } from "@tibia/protocol";

describe("bank intent schemas", () => {
  it("accepts bounded integer amounts only", () => {
    const message = {
      type: "bank-deposit",
      npcId: "npc:naji:1",
      amount: 100,
    };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ ...message, amount: 0 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, amount: -5 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, amount: 10.5 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        amount: BANK_LIMITS.maxTransactionAmount + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects client-supplied balances or extra fields", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "bank-withdraw",
        npcId: "npc:naji:1",
        amount: 100,
        balance: 1_000_000,
      }).success,
    ).toBe(false);
  });

  it("bounds the transfer recipient name", () => {
    const message = {
      type: "bank-transfer",
      npcId: "npc:naji:1",
      toCharacterName: "Saver Beta",
      amount: 100,
    };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ ...message, toCharacterName: "ab" })
        .success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        toCharacterName: "a".repeat(21),
      }).success,
    ).toBe(false);
  });
});
