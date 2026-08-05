import { describe, expect, it } from "vitest";
import type { Item } from "../item/Item";
import { itemAffixesOf } from "./itemAffixesOf";
import { itemRarityOf } from "./itemRarityOf";

function item(attributes: Record<string, unknown>): Item {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    typeId: 1,
    count: 1,
    attributes,
    version: 1,
    location: { kind: "world", position: { x: 0, y: 0, z: 7 }, stackIndex: 0 },
  };
}

describe("itemRarityOf", () => {
  it("reads a valid grade and rejects junk", () => {
    expect(itemRarityOf(item({ rarity: "epic" }))).toBe("epic");
    expect(itemRarityOf(item({}))).toBeUndefined();
    expect(itemRarityOf(item({ rarity: "mythic" }))).toBeUndefined();
    expect(itemRarityOf(item({ rarity: 3 }))).toBeUndefined();
  });
});

describe("itemAffixesOf", () => {
  it("keeps valid entries and drops malformed ones", () => {
    const affixes = itemAffixesOf(
      item({
        affixes: [
          { id: "maxHealth", value: 40 },
          { id: "resistance", value: 6, element: "fire" },
          { id: "skill", value: 2, skill: "sword" },
          { id: "resistance", value: 6 }, // missing element
          { id: "skill", value: 2, skill: "cooking" }, // unknown skill
          { id: "dodge", value: 2 }, // unknown id
          { id: "maxMana", value: -5 }, // non-positive
          { id: "maxMana", value: 1.5 }, // non-integer
          "junk",
          null,
        ],
      }),
    );
    expect(affixes).toEqual([
      { id: "maxHealth", value: 40 },
      { id: "resistance", value: 6, element: "fire" },
      { id: "skill", value: 2, skill: "sword" },
    ]);
  });

  it("reads empty from a missing or non-array bag", () => {
    expect(itemAffixesOf(item({}))).toEqual([]);
    expect(itemAffixesOf(item({ affixes: "many" }))).toEqual([]);
  });
});
