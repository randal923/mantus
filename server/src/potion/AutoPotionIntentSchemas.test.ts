import { clientMessageSchema } from "@tibia/protocol";
import { describe, expect, it } from "vitest";

describe("auto potion intent schema", () => {
  it("accepts bounded health and mana threshold settings", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-auto-potion-settings",
        settings: {
          enabled: true,
          health: { itemTypeId: 239, thresholdPercent: 45 },
          mana: { itemTypeId: 268, thresholdPercent: 30 },
          priority: "health",
        },
      }).success,
    ).toBe(true);
  });

  it.each([0, 100, 50.5])(
    "rejects an out-of-range threshold of %s",
    (thresholdPercent) => {
      expect(
        clientMessageSchema.safeParse({
          type: "update-auto-potion-settings",
          settings: {
            enabled: true,
            health: { itemTypeId: 239, thresholdPercent },
            mana: null,
            priority: "health",
          },
        }).success,
      ).toBe(false);
    },
  );

  it("rejects extra untrusted settings fields", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-auto-potion-settings",
        settings: {
          enabled: true,
          health: null,
          mana: null,
          priority: "health",
          targetPlayerId: "00000000-0000-4000-8000-000000000099",
        },
      }).success,
    ).toBe(false);
  });
});
