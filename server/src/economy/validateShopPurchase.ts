import { BANK_LIMITS } from "@tibia/protocol";
import type { ShopPurchaseRequest } from "./ShopStore";
import { validateShopCommon } from "./validateShopCommon";
import { validateShopCurrency } from "./validateShopCurrency";

export function validateShopPurchase(request: ShopPurchaseRequest): void {
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
    request.totalCost !== request.unitPrice * request.amount ||
    request.totalCost > BANK_LIMITS.maxTransactionAmount ||
    !Number.isInteger(request.maxCount) ||
    request.maxCount < 1 ||
    request.maxCount > 100 ||
    (request.stackable && request.subtype !== undefined) ||
    (request.stock !== undefined &&
      (!Number.isInteger(request.stock) ||
        request.stock < 1 ||
        request.stock > 1_000_000_000))
  ) {
    throw new Error("invalid shop purchase request");
  }
}
