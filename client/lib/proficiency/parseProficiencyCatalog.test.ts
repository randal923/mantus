import { describe, expect, it } from "vitest";
import { parseProficiencyCatalog } from "./parseProficiencyCatalog";

const VALID_PROFILE = {
  proficiencyId: 6,
  name: "Sanguine 1H Sword",
  version: 7,
  levels: [
    { perks: [{ type: "skill-bonus", value: 1, skill: "sword" }] },
    {
      perks: [
        { type: "auto-attack-critical-extra-damage", value: 0.1 },
        {
          type: "bestiary-damage",
          value: 0.03,
          bestiaryId: 21,
          bestiaryName: "Inkborn",
        },
      ],
    },
  ],
};

describe("parseProficiencyCatalog", () => {
  it("accepts the pinned perk-table projection", () => {
    expect(
      parseProficiencyCatalog({
        formatVersion: 1,
        profiles: [VALID_PROFILE],
      }),
    ).toHaveLength(1);
  });

  it("rejects malformed profiles instead of trusting the fetched asset", () => {
    expect(() =>
      parseProficiencyCatalog({
        formatVersion: 1,
        profiles: [{ ...VALID_PROFILE, proficiencyId: 0 }],
      }),
    ).toThrow("invalid proficiency catalog");
  });

  it("rejects perks with non-slug types", () => {
    expect(() =>
      parseProficiencyCatalog({
        formatVersion: 1,
        profiles: [
          {
            ...VALID_PROFILE,
            levels: [{ perks: [{ type: "Not A Slug", value: 1 }] }],
          },
        ],
      }),
    ).toThrow("invalid proficiency catalog");
  });

  it("rejects unknown format versions", () => {
    expect(() =>
      parseProficiencyCatalog({ formatVersion: 2, profiles: [] }),
    ).toThrow("invalid proficiency catalog");
  });
});
