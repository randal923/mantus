import type { ShopItemSubtype } from "./ShopStore";

const SHOP_IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateShopCommon(
  npcTypeId: string,
  shopId: string,
  offerId: string,
  itemTypeId: number,
  amount: number,
  unitPrice: number,
  subtype?: ShopItemSubtype,
): void {
  if (
    !SHOP_IDENTIFIER.test(npcTypeId) ||
    npcTypeId.length > 64 ||
    !SHOP_IDENTIFIER.test(shopId) ||
    shopId.length > 64 ||
    !SHOP_IDENTIFIER.test(offerId) ||
    offerId.length > 64 ||
    !Number.isInteger(itemTypeId) ||
    itemTypeId < 1 ||
    itemTypeId > 65_535 ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 100 ||
    !Number.isInteger(unitPrice) ||
    unitPrice < 0 ||
    unitPrice > 1_000_000_000 ||
    (subtype !== undefined &&
      ((!Number.isInteger(subtype.value) ||
        subtype.value < 1 ||
        subtype.value > 65_535) ||
        (subtype.kind !== "charges" && subtype.kind !== "fluid")))
  ) {
    throw new Error("invalid shop request");
  }
}
