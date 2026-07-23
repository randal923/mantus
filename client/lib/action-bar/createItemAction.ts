import type {
  ActionBarAction,
  InventoryItem,
  SpellCatalogEntry,
} from "@tibia/protocol";

export function createItemAction(
  item: InventoryItem,
  spells: ReadonlyArray<SpellCatalogEntry>,
): ActionBarAction {
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
    };
  }
  if (item.useKind === "potion") {
    return {
      kind: "item",
      itemTypeId: item.typeId,
      mode: "use-on-self",
    };
  }
  if (item.useKind === "useWith") {
    return {
      kind: "item",
      itemTypeId: item.typeId,
      mode: "use-with-crosshair",
    };
  }
  if (item.equipmentSlot) {
    return {
      kind: "item",
      itemTypeId: item.typeId,
      mode: "equip",
    };
  }
  return {
    kind: "item",
    itemTypeId: item.typeId,
    mode: "use",
  };
}
