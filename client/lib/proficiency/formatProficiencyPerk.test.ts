import { describe, expect, it } from "vitest";
import { i18n } from "../../i18n/i18n";
import { formatProficiencyPerk } from "./formatProficiencyPerk";

const t = i18n.getFixedT("en");

describe("formatProficiencyPerk", () => {
  it("renders fraction families as percentages", () => {
    expect(
      formatProficiencyPerk({ type: "critical-hit-chance", value: 0.02 }, t),
    ).toBe("+2% Critical Hit Chance");
  });

  it("renders flat families as plain integers", () => {
    expect(
      formatProficiencyPerk({ type: "attack-damage", value: 2 }, t),
    ).toBe("+2 Attack Damage");
  });

  it("interpolates localized skill names", () => {
    expect(
      formatProficiencyPerk(
        { type: "skill-bonus", value: 1, skill: "sword" },
        t,
      ),
    ).toBe("+1 Sword Fighting");
  });

  it("interpolates bestiary class names", () => {
    expect(
      formatProficiencyPerk(
        {
          type: "bestiary-damage",
          value: 0.03,
          bestiaryId: 21,
          bestiaryName: "Inkborn",
        },
        t,
      ),
    ).toBe("+3% Damage vs. Inkborn");
  });

  it("falls back to a generic slug label for unknown families", () => {
    expect(
      formatProficiencyPerk({ type: "future-mystery-perk", value: 0.5 }, t),
    ).toBe("Future Mystery Perk +0.5");
  });
});
