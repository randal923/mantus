import type { ShopEntryProjection } from "@tibia/protocol";
import type { ItemType } from "../item/ItemType";
import { resolveShopSubtype } from "./resolveShopSubtype";
import type { ShopEntry } from "./ShopCatalog";

/** Projects one catalog entry; empty when the type or subtype is invalid. */
export function projectShopEntry(
  entry: ShopEntry,
  type: ItemType | undefined,
): ShopEntryProjection[] {
  if (!type || resolveShopSubtype(entry, type) === null) return [];
  return [
    {
      offerId: entry.offerId,
      itemTypeId: entry.itemTypeId,
      clientId: type.clientId,
      spriteId: type.spriteId,
      name: entry.name,
      stackable: type.stackable,
      maxCount: type.maxCount,
      weight: type.weight,
      ...(type.stowable && entry.subtype === undefined
        ? { stowable: true }
        : {}),
      minimumAmount: entry.minimumAmount,
      maximumAmount: entry.maximumAmount,
      ...(entry.subtype === undefined ? {} : { subtype: entry.subtype }),
      ...(entry.buyPrice === undefined ? {} : { buyPrice: entry.buyPrice }),
      ...(entry.sellPrice === undefined
        ? {}
        : { sellPrice: entry.sellPrice }),
    },
  ];
}
