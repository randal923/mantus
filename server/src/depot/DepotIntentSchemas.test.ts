import { clientMessageSchema, DEPOT_LIMITS } from "@tibia/protocol";
import { describe, expect, it } from "vitest";

const SESSION_ID = "00000000-0000-4000-8000-000000000000";
const ITEM_ID = "11111111-1111-4111-8111-111111111111";

describe("depot intent schemas", () => {
  it("accepts bounded depot and stash intents", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "depot-deposit",
        sessionId: SESSION_ID,
        depotRevision: 1,
        itemId: ITEM_ID,
        itemRevision: 1,
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "stash-withdraw",
        sessionId: SESSION_ID,
        stashRevision: 1,
        itemTypeId: 3274,
        count: DEPOT_LIMITS.maxTransferCount,
      }).success,
    ).toBe(true);
  });

  it("rejects unbounded counts, searches, and client-supplied slots", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "stash-deposit",
        sessionId: SESSION_ID,
        stashRevision: 1,
        itemId: ITEM_ID,
        itemRevision: 1,
        count: DEPOT_LIMITS.maxTransferCount + 1,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "depot-browse",
        sessionId: SESSION_ID,
        location: "depot",
        page: 1,
        query: "x".repeat(DEPOT_LIMITS.maxSearchLength + 1),
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "depot-deposit",
        sessionId: SESSION_ID,
        depotRevision: 1,
        itemId: ITEM_ID,
        itemRevision: 1,
        destinationSlot: 0,
      }).success,
    ).toBe(false);
  });

  it("accepts only opaque mail ids and a bounded recipient name", () => {
    const message = {
      type: "send-mail",
      sessionId: SESSION_ID,
      requestId: "22222222-2222-4222-8222-222222222222",
      itemId: ITEM_ID,
      itemRevision: 1,
      recipientName: "Depot Receiver",
    };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ ...message, requestId: "retry-1" })
        .success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        recipientName: "x".repeat(21),
      }).success,
    ).toBe(false);
  });
});
