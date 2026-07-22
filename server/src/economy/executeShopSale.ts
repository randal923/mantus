import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { COIN_STACK_LIMIT } from "./coinStackLimit";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import { PgCoinOperations } from "./PgCoinOperations";
import { planMoneyGrant } from "./planMoneyGrant";
import { sellableShopRows } from "./sellableShopRows";
import type { ShopSaleResult } from "./ShopOperationResult";
import type { ShopSaleRequest } from "./ShopStore";
import { insertShopSaleAuditQuery } from "./sql/insertShopSaleAuditQuery";
import { TransactionRollback } from "./TransactionRollback";

/** Runs the item and money legs of one sale inside the open transaction. */
export async function executeShopSale(
  client: PoolClient,
  characterId: string,
  catalog: ItemCatalog,
  request: ShopSaleRequest,
): Promise<ShopSaleResult> {
  const coinOps = new PgCoinOperations(client, characterId, catalog);
  const owned = await coinOps.loadOwnedItems();
  const sellable = sellableShopRows(
    owned,
    request.itemTypeId,
    request.subtype,
  );
  if (coinOps.countRows(sellable) < request.amount) {
    return { status: "not-owned" };
  }
  const after = new Map<string, Item>();
  const removedItemIds: string[] = [];
  await coinOps.destroyItems(
    sellable,
    request.amount,
    request.itemTypeId,
    "shop-sale",
    after,
    removedItemIds,
  );
  const backpack = await coinOps.lockBackpackSlots();
  if (!backpack) {
    throw new TransactionRollback<ShopSaleResult>({ status: "no-space" });
  }
  const coins = coinOps.coinRows(owned);
  const proceeds = planMoneyGrant(request.totalProceeds);
  const grants = [
    {
      rows: coins.crystal,
      count: proceeds.crystal,
      typeId: CRYSTAL_COIN_TYPE_ID,
    },
    {
      rows: coins.platinum,
      count: proceeds.platinum,
      typeId: PLATINUM_COIN_TYPE_ID,
    },
    { rows: coins.gold, count: proceeds.gold, typeId: GOLD_COIN_TYPE_ID },
  ];
  const currencyRows = request.currencyItemTypeId === undefined
    ? []
    : coinOps.rowsOfType(owned, request.currencyItemTypeId);
  const currencyGranted = request.currencyItemTypeId === undefined
    ? true
    : await coinOps.grantStackable(
        currencyRows,
        request.totalProceeds,
        request.currencyItemTypeId,
        request.currencyMaxCount ?? 0,
        "shop-sale-currency",
        after,
        removedItemIds,
        backpack,
      );
  if (!currencyGranted) {
    throw new TransactionRollback<ShopSaleResult>({ status: "no-space" });
  }
  for (const grant of request.currencyItemTypeId === undefined ? grants : []) {
    const granted = await coinOps.grantStackable(
      grant.rows,
      grant.count,
      grant.typeId,
      COIN_STACK_LIMIT,
      "shop-sale",
      after,
      removedItemIds,
      backpack,
    );
    if (!granted) {
      throw new TransactionRollback<ShopSaleResult>({
        status: "no-space",
      });
    }
  }
  await client.query(insertShopSaleAuditQuery, [
    characterId,
    request.npcTypeId,
    request.shopId,
    request.offerId,
    request.itemTypeId,
    request.amount,
    request.totalProceeds,
    request.subtype?.value ?? null,
    request.currencyItemTypeId ?? null,
  ]);
  return {
    status: "committed",
    mutation: { after: [...after.values()], removedItemIds },
  };
}
