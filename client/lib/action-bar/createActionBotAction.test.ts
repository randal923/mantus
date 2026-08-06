import type { InventoryItem, SpellCatalogEntry } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { createActionBotAction } from "./createActionBotAction";

const SPELLS = [
  {
    id: "exori",
    origin: "spell",
    runeItemTypeId: null,
    name: "Berserk",
    words: "exori",
    targetKind: "direction",
  },
  {
    id: "sudden-death",
    origin: "rune",
    runeItemTypeId: 3155,
    name: "Sudden Death Rune",
    words: null,
    targetKind: "creature",
  },
] as unknown as ReadonlyArray<SpellCatalogEntry>;

const ITEMS = [
  {
    typeId: 266,
    clientId: 266,
    spriteId: 4321,
    name: "health potion",
    useKind: "potion",
  },
] as unknown as ReadonlyArray<InventoryItem>;

describe("createActionBotAction", () => {
  it("builds a spell action with the targeting the spell supports", () => {
    expect(createActionBotAction("spell:exori", SPELLS, ITEMS)).toEqual({
      kind: "spell",
      spellId: "exori",
      targetMode: "direction",
    });
  });

  it("builds an object action carrying the item's display", () => {
    expect(createActionBotAction("item:266", SPELLS, ITEMS)).toEqual({
      kind: "item",
      itemTypeId: 266,
      mode: "use-on-self",
      display: { name: "health potion", clientId: 266, spriteId: 4321 },
    });
  });

  it("refuses a rune catalog entry offered as a spoken spell", () => {
    expect(
      createActionBotAction("spell:sudden-death", SPELLS, ITEMS),
    ).toBeNull();
  });

  it("refuses unknown spells, uncarried objects, and junk values", () => {
    expect(createActionBotAction("spell:utori", SPELLS, ITEMS)).toBeNull();
    expect(createActionBotAction("item:9999", SPELLS, ITEMS)).toBeNull();
    expect(createActionBotAction("266", SPELLS, ITEMS)).toBeNull();
  });
});
