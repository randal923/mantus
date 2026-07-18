import { BANK_LIMITS } from "@tibia/protocol";
import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { appendBankLedger } from "./appendBankLedger";
import type { BankDepositResult } from "./BankOperationResult";
import { COIN_STACK_LIMIT } from "./coinStackLimit";
import { creditBankBalance } from "./creditBankBalance";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import { lockBankBalance } from "./lockBankBalance";
import { PgCoinOperations } from "./PgCoinOperations";
import { planMoneySpend } from "./planMoneySpend";
import { insertBankDepositAuditQuery } from "./sql/insertBankDepositAuditQuery";
import { TransactionRollback } from "./TransactionRollback";

/** Runs the coin and balance legs of one deposit inside the open transaction. */
export async function executeBankDeposit(
  client: PoolClient,
  characterId: string,
  amount: number,
  catalog: ItemCatalog,
): Promise<BankDepositResult> {
  const balance = await lockBankBalance(client, characterId);
  if (balance + amount > BANK_LIMITS.maxBalance) {
    return { status: "balance-limit" };
  }
  const coinOps = new PgCoinOperations(client, characterId, catalog);
  const owned = await coinOps.loadOwnedItems();
  const coins = coinOps.coinRows(owned);
  const plan = planMoneySpend(
    {
      gold: coinOps.countRows(coins.gold),
      platinum: coinOps.countRows(coins.platinum),
      crystal: coinOps.countRows(coins.crystal),
    },
    amount,
  );
  if (!plan) return { status: "insufficient-funds" };

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
      "bank-deposit",
      after,
      removedItemIds,
    );
  }
  const backpack = await coinOps.lockBackpackSlots(after);
  if (!backpack) {
    throw new TransactionRollback<BankDepositResult>({
      status: "no-space",
    });
  }
  const grants = [
    { rows: coins.gold, count: plan.goldChange, typeId: GOLD_COIN_TYPE_ID },
    {
      rows: coins.platinum,
      count: plan.platinumChange,
      typeId: PLATINUM_COIN_TYPE_ID,
    },
  ];
  for (const grant of grants) {
    const granted = await coinOps.grantStackable(
      grant.rows,
      grant.count,
      grant.typeId,
      COIN_STACK_LIMIT,
      "bank-deposit-change",
      after,
      removedItemIds,
      backpack,
    );
    if (!granted) {
      throw new TransactionRollback<BankDepositResult>({
        status: "no-space",
      });
    }
  }
  const balanceAfter = await creditBankBalance(client, characterId, amount);
  await appendBankLedger(client, characterId, "deposit", amount, balanceAfter);
  await client.query(insertBankDepositAuditQuery, [
    characterId,
    amount,
    balanceAfter,
  ]);
  return {
    status: "committed",
    balance: balanceAfter,
    mutation: { after: [...after.values()], removedItemIds },
  };
}
