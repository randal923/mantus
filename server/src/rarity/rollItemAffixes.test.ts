import { describe, expect, it } from "vitest";
import type { ItemType } from "../item/ItemType";
import { DEFAULT_RARITY_AFFIX_COUNTS } from "./affixDefinitions";
import { DISABLED_RARITY_CONFIG, type RarityConfig } from "./RarityConfig";
import type { RarityRoll } from "./RarityRoll";
import { AFFIX_IDS } from "./RolledAffix";
import { rollItemAffixes } from "./rollItemAffixes";
import { rollRarityAttributes } from "./rollRarityAttributes";

const TABLES = DISABLED_RARITY_CONFIG;

function itemType(overrides: Partial<ItemType> & { id: number }): ItemType {
  return {
    clientId: overrides.id,
    name: `type-${overrides.id}`,
    spriteId: overrides.id,
    stackable: false,
    maxCount: 1,
    weight: 100,
    pickupable: true,
    movable: true,
    light: { intensity: 0, color: 0 },
    elevation: 0,
    render: {
      ground: false,
      groundBorder: false,
      onBottom: false,
      onTop: false,
      stackable: false,
      fluidContainer: false,
      splash: false,
      hangable: false,
      hookSouth: false,
      hookEast: false,
      lyingCorpse: false,
      animateAlways: false,
      topEffect: false,
    },
    ...overrides,
  };
}

/** Deterministic low rolls: always pick index 0 / the range minimum. */
const LOW: RarityRoll = { integer: (minimum) => minimum };

function sequenceRoll(values: number[]): RarityRoll {
  let index = 0;
  return {
    integer: (minimum, maximum) => {
      const value = values[index] ?? minimum;
      index += 1;
      return Math.max(minimum, Math.min(maximum, value));
    },
  };
}

describe("rollItemAffixes", () => {
  it("rolls the grade's affix count with no duplicate ids", () => {
    for (const rarity of ["uncommon", "rare", "epic", "legendary"] as const) {
      const affixes = rollItemAffixes(rarity, itemType({ id: 1 }), LOW, TABLES);
      expect(affixes).toHaveLength(DEFAULT_RARITY_AFFIX_COUNTS[rarity]);
      const ids = affixes.map((affix) => affix.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("keeps magic level out of the uncommon pool", () => {
    for (let position = 0; position < AFFIX_IDS.length; position += 1) {
      const affixes = rollItemAffixes(
        "uncommon",
        itemType({ id: 1 }),
        sequenceRoll([position]),
        TABLES,
      );
      expect(affixes[0]?.id).not.toBe("magicLevel");
    }
  });

  it("scales values by the rarity multiplier", () => {
    // Index 0 = maxHealth (base 15-40); LOW rolls the minimum 15.
    expect(
      rollItemAffixes("uncommon", itemType({ id: 1 }), LOW, TABLES)[0],
    ).toMatchObject({ id: "maxHealth", value: 15 });
    expect(
      rollItemAffixes("legendary", itemType({ id: 1 }), LOW, TABLES)[0],
    ).toMatchObject({ id: "maxHealth", value: 45 });
  });

  it("matches the skill affix to the weapon and parameterizes resistance", () => {
    const skillIndex = AFFIX_IDS.indexOf("skill");
    const sword = rollItemAffixes(
      "uncommon",
      itemType({ id: 1, weaponType: "sword" }),
      sequenceRoll([skillIndex]),
      TABLES,
    );
    expect(sword[0]).toMatchObject({ id: "skill", skill: "sword" });

    const armor = rollItemAffixes(
      "uncommon",
      itemType({ id: 2, equipmentSlot: "armor" }),
      sequenceRoll([skillIndex]),
      TABLES,
    );
    expect(armor[0]).toMatchObject({ id: "skill", skill: "shielding" });

    const resistanceIndex = AFFIX_IDS.indexOf("resistance");
    const resistance = rollItemAffixes(
      "uncommon",
      itemType({ id: 3 }),
      sequenceRoll([resistanceIndex, 3, 0]),
      TABLES,
    );
    expect(resistance[0]?.id).toBe("resistance");
    expect(resistance[0]?.element).toBeDefined();
  });
});

describe("rollRarityAttributes", () => {
  const CONFIG: RarityConfig = {
    ...TABLES,
    chances: { uncommon: 100, rare: 0, epic: 0, legendary: 0 },
  };

  it("attaches a grade and affixes to eligible gear", () => {
    const attributes = rollRarityAttributes(
      itemType({ id: 1, equipmentSlot: "armor" }),
      LOW,
      CONFIG,
    );
    expect(attributes).toMatchObject({ rarity: "uncommon" });
    expect(Array.isArray(attributes?.affixes)).toBe(true);
  });

  it("skips stackables and non-equipment", () => {
    expect(
      rollRarityAttributes(
        itemType({ id: 1, weaponType: "distance", stackable: true }),
        LOW,
        CONFIG,
      ),
    ).toBeUndefined();
    expect(
      rollRarityAttributes(itemType({ id: 2 }), LOW, CONFIG),
    ).toBeUndefined();
  });
});
