import type { PoolClient } from "pg";
import { COIN_STACK_LIMIT } from "../economy/coinStackLimit";
import { countMoneyWorth } from "../economy/countMoneyWorth";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "../economy/CurrencyBalance";
import { lockBankBalance } from "../economy/lockBankBalance";
import { PgCoinOperations } from "../economy/PgCoinOperations";
import { planMoneySpend } from "../economy/planMoneySpend";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";

export type MarketSpendResult =
  | {
      readonly status: "ok";
      readonly carriedPaid: number;
      readonly bankPaid: number;
      /** Coin rows changed by the carried legs, id-keyed as stored. */
      readonly after: Map<string, Item>;
      readonly removedItemIds: string[];
    }
  | { readonly status: "insufficient-funds" | "no-space" };

/**
 * Pays `amount` from carried coins first, bank for the remainder (Canary's
 * order). Destroys/creates the coin rows inside the caller's transaction and
 * locks the bank row when it is needed; the caller performs the bank debit
 * and its ledger entries, and must roll the transaction back on any non-ok
 * status.
 */
export async function spendMarketFunds(
  client: PoolClient,
  characterId: string,
  catalog: ItemCatalog,
  amount: number,
): Promise<MarketSpendResult> {
  if (amount === 0) {
    return {
      status: "ok",
      carriedPaid: 0,
      bankPaid: 0,
      after: new Map(),
      removedItemIds: [],
    };
  }
  const coinOps = new PgCoinOperations(client, characterId, catalog);
  const owned = await coinOps.loadOwnedItems();
  const coins = coinOps.coinRows(owned);
  const carried = {
    gold: coinOps.countRows(coins.gold),
    platinum: coinOps.countRows(coins.platinum),
    crystal: coinOps.countRows(coins.crystal),
  };
  const carriedPaid = Math.min(countMoneyWorth(carried), amount);
  const bankPaid = amount - carriedPaid;
  if (bankPaid > 0) {
    const balance = await lockBankBalance(client, characterId);
    if (balance < bankPaid) return { status: "insufficient-funds" };
  }
  const plan = planMoneySpend(carried, carriedPaid);
  if (!plan) throw new Error("market payment plan is inconsistent");

  const after = new Map<string, Item>();
  const removedItemIds: string[] = [];
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
  for (const spend of spends) {
    await coinOps.destroyItems(
      spend.rows,
      spend.count,
      spend.typeId,
      "market-payment",
      after,
      removedItemIds,
    );
  }
  const changeGrants = [
    { rows: coins.gold, count: plan.goldChange, typeId: GOLD_COIN_TYPE_ID },
    {
      rows: coins.platinum,
      count: plan.platinumChange,
      typeId: PLATINUM_COIN_TYPE_ID,
    },
  ].filter((grant) => grant.count > 0);
  if (changeGrants.length > 0) {
    const backpack = await coinOps.lockBackpackSlots();
    if (!backpack) return { status: "no-space" };
    for (const grant of changeGrants) {
      const granted = await coinOps.grantStackable(
        grant.rows,
        grant.count,
        grant.typeId,
        COIN_STACK_LIMIT,
        "market-payment-change",
        after,
        removedItemIds,
        backpack,
      );
      if (!granted) return { status: "no-space" };
    }
  }
  return { status: "ok", carriedPaid, bankPaid, after, removedItemIds };
}
