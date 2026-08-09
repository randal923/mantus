import { CUSTOM_ITEM_APPEARANCES } from "@tibia/protocol";
import type { ItemType } from "../ItemType";
import type { CustomItemType } from "./CustomItemType";

/**
 * Mints the custom item types from their base types.
 *
 * Fails closed: an unknown base, or an id the client has no appearance alias
 * for, is a startup error rather than an item that exists on the server and
 * cannot be drawn. The alias table is what the client loads, so the two
 * disagreeing is exactly the bug worth refusing to boot on.
 */
export function buildCustomItemTypes(
  items: ReadonlyArray<ItemType>,
  customs: ReadonlyArray<CustomItemType>,
): ReadonlyArray<ItemType> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const appearances = new Map(
    CUSTOM_ITEM_APPEARANCES.map((entry) => [entry.typeId, entry.appearanceOf]),
  );
  if (appearances.size !== customs.length) {
    throw new Error(
      `${customs.length} custom item types but ${appearances.size} appearance aliases`,
    );
  }
  return customs.map((custom) => {
    const base = byId.get(custom.baseTypeId);
    if (!base) {
      throw new Error(
        `custom item ${custom.id} copies unknown item ${custom.baseTypeId}`,
      );
    }
    if (byId.has(custom.id)) {
      throw new Error(`custom item ${custom.id} collides with a catalog item`);
    }
    if (appearances.get(custom.id) !== custom.baseTypeId) {
      throw new Error(
        `custom item ${custom.id} has no appearance alias for ${custom.baseTypeId}`,
      );
    }
    return {
      ...base,
      id: custom.id,
      clientId: custom.id,
      name: custom.name,
      article: custom.article,
      ...(custom.charges !== undefined ? { charges: custom.charges } : {}),
      ...(custom.movable !== undefined ? { movable: custom.movable } : {}),
      description: custom.description,
    };
  });
}
