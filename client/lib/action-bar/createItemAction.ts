import type {
  ActionBarAction,
  CarriedItemSummary,
  SpellCatalogEntry,
} from "@tibia/protocol";

export function createItemAction(
  item: CarriedItemSummary,
  spells: ReadonlyArray<SpellCatalogEntry>,
): ActionBarAction {
  // The display keeps the button's icon and name drawable after the last
  // carried one is consumed; the server rewrites it from its own catalog.
  const display = {
    name: item.name,
    clientId: item.clientId,
    spriteId: item.spriteId,
  };
  if (item.useKind === "rune") {
    const rune = spells.find(
      (spell) =>
        spell.origin === "rune" &&
        spell.runeItemTypeId === item.typeId,
    );
    return {
      kind: "item",
      itemTypeId: item.typeId,
      mode:
        rune?.targetKind === "position"
          ? "use-with-crosshair"
          : rune?.targetKind === "self"
            ? "use-on-self"
            : "use-on-target",
      display,
    };
  }
  if (item.useKind === "potion") {
    return {
      kind: "item",
      itemTypeId: item.typeId,
      mode: "use-on-self",
      display,
    };
  }
  if (item.useKind === "useWith" || item.useKind === "useWithItem") {
    return {
      kind: "item",
      itemTypeId: item.typeId,
      mode: "use-with-crosshair",
      display,
    };
  }
  // Same precedence as a click in the inventory window: an object that opens,
  // reads, rotates, eats or activates does that even when it could also be
  // worn (a backpack, the Portable Seller). Equip stays a picker choice.
  if (
    item.useKind === "container" ||
    item.useKind === "read" ||
    item.useKind === "rotate" ||
    item.useKind === "food" ||
    item.useKind === "activate"
  ) {
    return {
      kind: "item",
      itemTypeId: item.typeId,
      mode: "use",
      display,
    };
  }
  if (item.equipmentSlot) {
    return {
      kind: "item",
      itemTypeId: item.typeId,
      mode: "equip",
      display,
    };
  }
  return {
    kind: "item",
    itemTypeId: item.typeId,
    mode: "use",
    display,
  };
}
