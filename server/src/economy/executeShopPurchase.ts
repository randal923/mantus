import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { COIN_STACK_LIMIT } from "./coinStackLimit";
import { countMoneyWorth } from "./countMoneyWorth";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import { debitShopBankBalance } from "./debitShopBankBalance";
import { lockBankBalance } from "./lockBankBalance";
import { ownedRowHasAttributes } from "./ownedRowHasAttributes";
import { PgCoinOperations } from "./PgCoinOperations";
import { planMoneySpend } from "./planMoneySpend";
import { reserveShopStock } from "./reserveShopStock";
import type { ShopPurchaseResult } from "./ShopOperationResult";
import { shopSubtypeAttributes } from "./shopSubtypeAttributes";
import type { ShopPurchaseRequest } from "./ShopStore";
import { insertShopPurchaseAuditQuery } from "./sql/insertShopPurchaseAuditQuery";
import { TransactionRollback } from "./TransactionRollback";

/** Runs the money and item legs of one purchase inside the open transaction. */
export async function executeShopPurchase(
  client: PoolClient,
  characterId: string,
  catalog: ItemCatalog,
  request: ShopPurchaseRequest,
): Promise<ShopPurchaseResult> {
  const coinOps = new PgCoinOperations(client, characterId, catalog);
  const owned = await coinOps.loadOwnedItems();
  const currencyRows = request.currencyItemTypeId === undefined
    ? []
    : coinOps.rowsOfType(owned, request.currencyItemTypeId);
  if (
    request.currencyItemTypeId !== undefined &&
    coinOps.countRows(currencyRows) < request.totalCost
  ) {
    return { status: "insufficient-funds" };
  }
  const coins = coinOps.coinRows(owned);
  const carried = {
    gold: coinOps.countRows(coins.gold),
    platinum: coinOps.countRows(coins.platinum),
    crystal: coinOps.countRows(coins.crystal),
  };
  const carriedWorth = countMoneyWorth(carried);
  const carriedPay = request.currencyItemTypeId === undefined
    ? Math.min(carriedWorth, request.totalCost)
    : 0;
  const bankPay = request.currencyItemTypeId === undefined
    ? request.totalCost - carriedPay
    : 0;
  if (bankPay > 0 && request.currencyItemTypeId === undefined) {
    const balance = await lockBankBalance(client, characterId);
    if (balance < bankPay) return { status: "insufficient-funds" };
  }
  const stockRemaining = await reserveShopStock(client, request);
  if (stockRemaining === null) return { status: "out-of-stock" };
  const plan = planMoneySpend(carried, carriedPay);
  if (!plan) throw new Error("shop payment plan is inconsistent");

  const after = new Map<string, Item>();
  const removedItemIds: string[] = [];
  if (request.currencyItemTypeId !== undefined && request.totalCost > 0) {
    await coinOps.destroyItems(
      currencyRows,
      request.totalCost,
      request.currencyItemTypeId,
      "shop-purchase-currency",
      after,
      removedItemIds,
    );
  }
  const spends = [
    { rows: coins.gold, count: plan.goldSpent, typeId: GOLD_COIN_TYPE_ID },
    {
      rows: coins.platinum,
      count: plan.platinumSpent,
      typeId: PLATINUM_COIN_TYPE_ID,
    },
    {
      rows: coins.crystal,
      count: plan.crystalSpent,
      typeId: CRYSTAL_COIN_TYPE_ID,
    },
  ];
  for (const spend of request.currencyItemTypeId === undefined ? spends : []) {
    await coinOps.destroyItems(
      spend.rows,
      spend.count,
      spend.typeId,
      "shop-purchase",
      after,
      removedItemIds,
    );
  }
  const backpack = await coinOps.lockBackpackSlots();
  if (!backpack) {
    throw new TransactionRollback<ShopPurchaseResult>({
      status: "no-space",
    });
  }
  const changeGrants = [
    { rows: coins.gold, count: plan.goldChange, typeId: GOLD_COIN_TYPE_ID },
    {
      rows: coins.platinum,
      count: plan.platinumChange,
      typeId: PLATINUM_COIN_TYPE_ID,
    },
  ];
  for (const grant of changeGrants) {
    const granted = await coinOps.grantStackable(
      grant.rows,
      grant.count,
      grant.typeId,
      COIN_STACK_LIMIT,
      "shop-purchase-change",
      after,
      removedItemIds,
      backpack,
    );
    if (!granted) {
      throw new TransactionRollback<ShopPurchaseResult>({
        status: "no-space",
      });
    }
  }
  const itemAttributes = shopSubtypeAttributes(request.subtype);
  const matchingRows = coinOps
    .rowsOfType(owned, request.itemTypeId)
    .filter((row) => ownedRowHasAttributes(row, itemAttributes));
  const granted = request.stackable
    ? await coinOps.grantStackable(
        matchingRows,
        request.amount,
        request.itemTypeId,
        request.maxCount,
        "shop-purchase",
        after,
        removedItemIds,
        backpack,
      )
    : await coinOps.grantSingles(
        request.amount,
        request.itemTypeId,
        "shop-purchase",
        after,
        backpack,
        itemAttributes,
      );
  if (!granted) {
    throw new TransactionRollback<ShopPurchaseResult>({
      status: "no-space",
    });
  }
  if (bankPay > 0 && request.currencyItemTypeId === undefined) {
    await debitShopBankBalance(client, characterId, bankPay);
  }
  await client.query(insertShopPurchaseAuditQuery, [
    characterId,
    request.npcTypeId,
    request.shopId,
    request.offerId,
    request.itemTypeId,
    request.amount,
    request.totalCost,
    bankPay,
    request.subtype?.value ?? null,
    stockRemaining ?? null,
    request.currencyItemTypeId ?? null,
  ]);
  return {
    status: "committed",
    mutation: { after: [...after.values()], removedItemIds },
    bankSpent: bankPay,
  };
}
