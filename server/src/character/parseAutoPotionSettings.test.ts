import { describe, expect, it } from "vitest";
import { parseAutoPotionSettings } from "./parseAutoPotionSettings";
import { parsePotionActionBar } from "./parsePotionActionBar";

describe("potion action bar persistence parsing", () => {
  it("keeps legacy slot arrays and defaults auto potion to disabled", () => {
    const legacySlots = [
      { itemTypeId: 266, targetMode: "self" as const },
    ];

    expect(parsePotionActionBar(legacySlots)).toEqual(legacySlots);
    expect(parseAutoPotionSettings(legacySlots)).toEqual({
      enabled: false,
      health: null,
      mana: null,
      priority: "health",
    });
  });

  it("parses the combined persisted shape", () => {
    const slots = [{ itemTypeId: 268, targetMode: "crosshair" as const }];
    const settings = {
      enabled: true,
      health: null,
      mana: { itemTypeId: 268, thresholdPercent: 35 },
      priority: "mana" as const,
    };

    const persisted = { slots, autoPotionSettings: settings };

    expect(parsePotionActionBar(persisted)).toEqual(slots);
    expect(parseAutoPotionSettings(persisted)).toEqual(settings);
  });

  it("fails closed when persisted settings are malformed", () => {
    expect(
      parseAutoPotionSettings({
        slots: [],
        autoPotionSettings: {
          enabled: true,
          health: { itemTypeId: 266, thresholdPercent: 200 },
          mana: null,
          priority: "health",
        },
      }),
    ).toEqual({
      enabled: false,
      health: null,
      mana: null,
      priority: "health",
    });
  });
});
