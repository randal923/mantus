import { BANK_LIMITS } from "@tibia/protocol";
import type { ShopSaleRequest } from "./ShopStore";
import { validateShopCommon } from "./validateShopCommon";
import { validateShopCurrency } from "./validateShopCurrency";

export function validateShopSale(request: ShopSaleRequest): void {
  validateShopCommon(
    request.npcTypeId,
    request.shopId,
    request.offerId,
    request.itemTypeId,
    request.amount,
    request.unitPrice,
    request.subtype,
  );
  validateShopCurrency(request.currencyItemTypeId, request.currencyMaxCount);
  if (
    request.totalProceeds !== request.unitPrice * request.amount ||
    request.totalProceeds > BANK_LIMITS.maxTransactionAmount
  ) {
    throw new Error("invalid shop sale request");
  }
}
