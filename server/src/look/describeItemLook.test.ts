import { beforeAll, describe, expect, it } from "vitest";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { describeItemLook } from "./describeItemLook";

const FIRE_SWORD = 3_280;
const PLATE_ARMOR = 3_357;
const CROSSBOW = 3_349;
const BOLT = 3_446;
const GOLD_COIN = 3_031;
const BACKPACK = 2_854;
const WAND_OF_VORTEX = 3_074;
const MAGIC_PLATE_ARMOR = 3_366;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

const look = (
  itemId: number,
  distance = 1,
  state?: Parameters<typeof describeItemLook>[2],
) => describeItemLook(catalog.require(itemId), distance, state);

describe("describeItemLook", () => {
  it("names an item behind its article and reports its stat group", () => {
    expect(look(FIRE_SWORD)).toBe(
      [
        "a fire sword (Atk:24 physical + 11 fire, Def:20 +1).",
        "It can only be wielded properly by players of level 30 or higher.",
        "It weighs 23.00 oz.",
        "The blade is a magic flame",
      ].join("\n"),
    );
  });

  it("shows armor for armor pieces and the base vocations only", () => {
    expect(look(PLATE_ARMOR)).toBe("a plate armor (Arm:10).\nIt weighs 120.00 oz.");
    expect(look(MAGIC_PLATE_ARMOR).split("\n")[1]).toBe(
      "It can only be wielded properly by knights and paladins.",
    );
  });

  it("uses Canary's distance-weapon group for bows and none for ammunition", () => {
    expect(look(CROSSBOW)).toBe("a crossbow (Range: 5).\nIt weighs 40.00 oz.");
    expect(look(BOLT, 1, { count: 30 })).toBe("30 bolts.\nThey weigh 24.00 oz.");
  });

  it("counts and pluralises a stack, weighing the whole stack", () => {
    expect(look(GOLD_COIN, 1, { count: 17 })).toBe(
      "17 gold coins.\nThey weigh 1.70 oz.",
    );
    expect(look(GOLD_COIN, 1, { count: 1 })).toBe(
      "a gold coin.\nIt weighs 0.10 oz.",
    );
  });

  it("reports a container's volume", () => {
    expect(look(BACKPACK)).toBe("a backpack (Vol:20).\nIt weighs 18.00 oz.");
  });

  it("keeps the wand range and mana cost our catalog carries", () => {
    expect(look(WAND_OF_VORTEX).split("\n")[0]).toBe(
      "a wand of vortex (Range:3, Mana:1).",
    );
  });

  it("hides weight and flavour text from a distant looker", () => {
    expect(look(FIRE_SWORD, 5)).toBe(
      [
        "a fire sword (Atk:24 physical + 11 fire, Def:20 +1).",
        "It can only be wielded properly by players of level 30 or higher.",
      ].join("\n"),
    );
  });

  it("prefers an instance's own description over the type's", () => {
    const text = look(FIRE_SWORD, 1, {
      attributes: { description: "A gift from Bozo." },
    });
    expect(text.endsWith("\nA gift from Bozo.")).toBe(true);
    expect(text).not.toContain("The blade is a magic flame");
  });

  it("adds the classification and imbuement lines only for real instances", () => {
    expect(look(MAGIC_PLATE_ARMOR, 1, { attributes: {} })).toContain(
      "Imbuements: (Empty Slot, Empty Slot).",
    );
    expect(look(MAGIC_PLATE_ARMOR, 1, { attributes: {} })).toContain(
      "Classification: 2 Tier: 0.",
    );
    expect(look(MAGIC_PLATE_ARMOR, 1)).not.toContain("Classification");
  });

  it("renders a running imbuement with its remaining time", () => {
    expect(
      look(MAGIC_PLATE_ARMOR, 1, {
        attributes: {
          imbuements: [
            { slot: 0, imbuementId: 1, remainingSeconds: 12_000, name: "Powerful Vampirism" },
          ],
        },
      }),
    ).toContain("Imbuements: (Powerful Vampirism 03:20h, Empty Slot).");
  });
});
