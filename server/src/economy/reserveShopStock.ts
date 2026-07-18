import type { PoolClient } from "pg";
import type { ShopPurchaseRequest } from "./ShopStore";
import { insertShopStockQuery } from "./sql/insertShopStockQuery";
import { lockShopStockQuery } from "./sql/lockShopStockQuery";
import { updateShopStockQuery } from "./sql/updateShopStockQuery";

/**
 * Locks and decrements the offer's stock row. Returns the remaining stock,
 * null when the stock is exhausted, or undefined for unlimited offers.
 */
export async function reserveShopStock(
  client: PoolClient,
  request: ShopPurchaseRequest,
): Promise<number | null | undefined> {
  if (request.stock === undefined) return undefined;
  await client.query(insertShopStockQuery, [
    request.shopId,
    request.offerId,
    request.stock,
  ]);
  const locked = await client.query<{
    initial_stock: number;
    remaining_stock: number;
  }>(lockShopStockQuery, [request.shopId, request.offerId]);
  const row = locked.rows[0];
  if (!row) throw new Error("shop stock is missing");
  if (row.initial_stock !== request.stock) {
    throw new Error("shop stock does not match the current catalog");
  }
  if (row.remaining_stock < request.amount) return null;
  const remaining = row.remaining_stock - request.amount;
  await client.query(updateShopStockQuery, [
    request.shopId,
    request.offerId,
    remaining,
  ]);
  return remaining;
}
