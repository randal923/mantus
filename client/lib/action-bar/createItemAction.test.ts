import { describe, expect, it } from "vitest";
import type { CarriedItemSummary, SpellCatalogEntry } from "@tibia/protocol";
import { createItemAction } from "./createItemAction";

function carried(
  overrides: Partial<CarriedItemSummary> & { typeId: number },
): CarriedItemSummary {
  return {
    clientId: overrides.typeId,
    spriteId: 1,
    name: `Object ${overrides.typeId}`,
    count: 1,
    ...overrides,
  };
}

const positionRune = {
  id: "adori-gran-flam",
  origin: "rune",
  runeItemTypeId: 3189,
  targetKind: "position",
} as unknown as SpellCatalogEntry;

describe("createItemAction", () => {
  it("gives an exercise weapon the crosshair, the same as a tool", () => {
    expect(
      createItemAction(carried({ typeId: 28_552, useKind: "useWith" }), []),
    ).toMatchObject({ mode: "use-with-crosshair" });
  });

  it("opens a wearable container rather than equipping it", () => {
    expect(
      createItemAction(
        carried({ typeId: 2854, useKind: "container", equipmentSlot: "backpack" }),
        [],
      ),
    ).toMatchObject({ mode: "use" });
  });

  it("activates a device that also has a slot, like the inventory click does", () => {
    expect(
      createItemAction(
        carried({ typeId: 23_722, useKind: "activate", equipmentSlot: "bound" }),
        [],
      ),
    ).toMatchObject({ mode: "use" });
  });

  it.each(["read", "rotate", "food"] as const)(
    "uses a %s object",
    (useKind) => {
      expect(
        createItemAction(carried({ typeId: 3505, useKind }), []),
      ).toMatchObject({ mode: "use" });
    },
  );

  it("equips plain equipment", () => {
    expect(
      createItemAction(carried({ typeId: 3357, equipmentSlot: "armor" }), []),
    ).toMatchObject({ mode: "equip" });
  });

  it("aims a position rune with the crosshair and a potion at the player", () => {
    expect(
      createItemAction(carried({ typeId: 3189, useKind: "rune" }), [
        positionRune,
      ]),
    ).toMatchObject({ mode: "use-with-crosshair" });
    expect(
      createItemAction(carried({ typeId: 239, useKind: "potion" }), []),
    ).toMatchObject({ mode: "use-on-self" });
  });

  it("keeps the object's display for the button", () => {
    expect(
      createItemAction(
        carried({ typeId: 3505, clientId: 3505, spriteId: 77, name: "letter" }),
        [],
      ),
    ).toEqual({
      kind: "item",
      itemTypeId: 3505,
      mode: "use",
      display: { name: "letter", clientId: 3505, spriteId: 77 },
    });
  });
});
