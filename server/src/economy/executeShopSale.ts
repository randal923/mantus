import { BANK_LIMITS, CRYSTAL_WORTH, PLATINUM_WORTH } from "@tibia/protocol";
import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { appendBankLedger } from "./appendBankLedger";
import { COIN_STACK_LIMIT } from "./coinStackLimit";
import { creditBankBalance } from "./creditBankBalance";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import { lockBankBalance } from "./lockBankBalance";
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
      worth: CRYSTAL_WORTH,
    },
    {
      rows: coins.platinum,
      count: proceeds.platinum,
      typeId: PLATINUM_COIN_TYPE_ID,
      worth: PLATINUM_WORTH,
    },
    {
      rows: coins.gold,
      count: proceeds.gold,
      typeId: GOLD_COIN_TYPE_ID,
      worth: 1,
    },
  ];
  const currencyRows = request.currencyItemTypeId === undefined
    ? []
    : coinOps.rowsOfType(owned, request.currencyItemTypeId);
  // A non-gold shop currency has no bank denomination, so it stays
  // all-or-nothing: the whole sale rolls back when the coins do not fit.
  if (request.currencyItemTypeId !== undefined) {
    const ungranted = await coinOps.grantStackable(
      currencyRows,
      request.totalProceeds,
      request.currencyItemTypeId,
      request.currencyMaxCount ?? 0,
      "shop-sale-currency",
      after,
      removedItemIds,
      backpack,
    );
    if (ungranted > 0) {
      throw new TransactionRollback<ShopSaleResult>({ status: "no-space" });
    }
  }
  // Canary credits the bank with whatever the player cannot carry rather than
  // failing the sale; the two legs commit in this one transaction.
  let bankCredited = 0;
  for (const grant of request.currencyItemTypeId === undefined ? grants : []) {
    const ungranted = await coinOps.grantStackable(
      grant.rows,
      grant.count,
      grant.typeId,
      COIN_STACK_LIMIT,
      "shop-sale",
      after,
      removedItemIds,
      backpack,
    );
    bankCredited += ungranted * grant.worth;
  }
  if (bankCredited > 0) {
    // Locks (and creates) the account row before crediting it, so a racing
    // sale on the same character serializes here instead of over-crediting.
    const balance = await lockBankBalance(client, characterId);
    if (balance + bankCredited > BANK_LIMITS.maxBalance) {
      throw new TransactionRollback<ShopSaleResult>({ status: "no-space" });
    }
    const balanceAfter = await creditBankBalance(
      client,
      characterId,
      bankCredited,
    );
    await appendBankLedger(
      client,
      characterId,
      "shop-sale",
      bankCredited,
      balanceAfter,
    );
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
    bankCredited,
  ]);
  return {
    status: "committed",
    mutation: { after: [...after.values()], removedItemIds },
    bankCredited,
  };
}
