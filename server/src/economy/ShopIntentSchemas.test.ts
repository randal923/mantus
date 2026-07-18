import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("shop intent schemas", () => {
  it("accepts only ids and a bounded amount", () => {
    const message = {
      type: "shop-buy",
      npcId: "npc:sam:1",
      shopSessionId: "00000000-0000-4000-8000-000000000000",
      offerId: "item-3274",
      amount: 5,
    };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ ...message, amount: 0 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, amount: 101 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, offerId: "" }).success,
    ).toBe(false);
  });

  it("rejects client-supplied prices", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "shop-buy",
        npcId: "npc:sam:1",
        shopSessionId: "00000000-0000-4000-8000-000000000000",
        offerId: "item-3274",
        amount: 1,
        price: 1,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "shop-sell",
        npcId: "npc:sam:1",
        shopSessionId: "00000000-0000-4000-8000-000000000000",
        offerId: "item-3274",
        amount: 1,
        sellPrice: 100_000,
      }).success,
    ).toBe(false);
  });

  it("rejects malformed offer and shop-session ids", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "shop-sell",
        npcId: "npc:sam:1",
        shopSessionId: "not-a-session",
        offerId: "Sam' OR 1=1",
        amount: 1,
      }).success,
    ).toBe(false);
  });
});
