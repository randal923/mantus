import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clientMessageSchema, MARKET_LIMITS } from "@tibia/protocol";

const requestId = randomUUID();
const offerId = randomUUID();

describe("market intent schemas", () => {
  it("bounds market-open pages", () => {
    const message = { type: "market-open", page: 1 };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ ...message, page: 0 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        page: MARKET_LIMITS.maxItemPages + 1,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, sessionId: "not-a-uuid" })
        .success,
    ).toBe(false); // strict: the retired depot-session field is rejected
  });

  it("accepts bounded create-offer intents only", () => {
    const message = {
      type: "market-create-offer",
      requestId,
      side: "sell",
      itemTypeId: 675,
      amount: 100,
      unitPrice: 500,
    };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ ...message, amount: 0 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        amount: MARKET_LIMITS.maxAmountStackable + 1,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, unitPrice: 0 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, unitPrice: 10.5 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        unitPrice: MARKET_LIMITS.maxUnitPrice + 1,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, side: "steal" }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, itemTypeId: 0 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, itemTypeId: 70_000 })
        .success,
    ).toBe(false);
  });

  it("rejects injection-shaped and non-uuid identifiers", () => {
    const message = {
      type: "market-accept-offer",
      requestId,
      offerId,
      amount: 1,
    };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        offerId: "1; DROP TABLE market_offers;--",
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        requestId: "' OR '1'='1",
      }).success,
    ).toBe(false);
  });

  it("rejects extra fields on strict market intents", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "market-cancel-offer",
        requestId,
        offerId,
        refund: 1_000_000,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "market-accept-offer",
        requestId,
        offerId,
        amount: 1,
        unitPrice: 1,
      }).success,
    ).toBe(false);
  });

  it("keeps read intents fixed-size and typed", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "market-browse",
        itemTypeId: 675,
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "market-browse",
        itemTypeId: "675",
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: "market-own-offers" }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({ type: "market-own-history" }).success,
    ).toBe(true);
  });
});
