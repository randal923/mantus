import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("house intent schemas", () => {
  it("accepts well-formed house intents", () => {
    const intents = [
      { type: "house-open" },
      { type: "house-open", houseId: 2630 },
      { type: "house-buy", houseId: 1 },
      { type: "house-abandon" },
      { type: "house-transfer-offer", targetName: "Bob", price: 0 },
      { type: "house-transfer-offer", targetName: "Bob", price: 100_000 },
      { type: "house-transfer-respond", houseId: 2630, accept: true },
      { type: "house-transfer-cancel" },
      {
        type: "house-set-access",
        kind: "guest",
        targetName: "Bob",
        grant: true,
      },
      {
        type: "house-set-access",
        kind: "subowner",
        targetName: "Bob",
        grant: false,
      },
      { type: "house-kick" },
      { type: "house-kick", targetCharacterId: "abc" },
      { type: "house-browse" },
      { type: "house-browse", townId: 5, page: 3 },
    ];
    for (const intent of intents) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(true);
    }
  });

  it("rejects out-of-bounds and malformed house intents", () => {
    const rejected = [
      { type: "house-open", houseId: 0 },
      { type: "house-open", houseId: 1.5 },
      { type: "house-buy" },
      { type: "house-buy", houseId: 1_000_001 },
      { type: "house-transfer-offer", targetName: "", price: 1 },
      { type: "house-transfer-offer", targetName: "Bob", price: -1 },
      {
        type: "house-transfer-offer",
        targetName: "Bob",
        price: 2_000_000_000_000,
      },
      { type: "house-transfer-respond", houseId: 1, accept: "yes" },
      { type: "house-set-access", kind: "door", targetName: "Bob", grant: true },
      { type: "house-set-access", kind: "guest", targetName: "Bob" },
      { type: "house-kick", targetCharacterId: "" },
      { type: "house-browse", townId: -1 },
      { type: "house-browse", page: 10_001 },
      { type: "house-abandon", extra: true },
    ];
    for (const intent of rejected) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(false);
    }
  });
});
