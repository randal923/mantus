import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { appendBankLedger } from "./appendBankLedger";
import type { BankWithdrawResult } from "./BankOperationResult";
import { COIN_STACK_LIMIT } from "./coinStackLimit";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import { debitBankBalance } from "./debitBankBalance";
import { lockBankBalance } from "./lockBankBalance";
import { PgCoinOperations } from "./PgCoinOperations";
import { planMoneyGrant } from "./planMoneyGrant";
import { insertBankWithdrawAuditQuery } from "./sql/insertBankWithdrawAuditQuery";
import { TransactionRollback } from "./TransactionRollback";

/** Runs the balance and coin legs of one withdrawal inside the open transaction. */
export async function executeBankWithdraw(
  client: PoolClient,
  characterId: string,
  amount: number,
  catalog: ItemCatalog,
): Promise<BankWithdrawResult> {
  const balance = await lockBankBalance(client, characterId);
  if (balance < amount) return { status: "insufficient-balance" };
  const grant = planMoneyGrant(amount);
  const coinOps = new PgCoinOperations(client, characterId, catalog);
  const owned = await coinOps.loadOwnedItems();
  const coins = coinOps.coinRows(owned);

  const after = new Map<string, Item>();
  const backpack = await coinOps.lockBackpackSlots();
  if (!backpack) {
    throw new TransactionRollback<BankWithdrawResult>({
      status: "no-space",
    });
  }
  const grants = [
    {
      rows: coins.crystal,
      count: grant.crystal,
      typeId: CRYSTAL_COIN_TYPE_ID,
    },
    {
      rows: coins.platinum,
      count: grant.platinum,
      typeId: PLATINUM_COIN_TYPE_ID,
    },
    { rows: coins.gold, count: grant.gold, typeId: GOLD_COIN_TYPE_ID },
  ];
  for (const entry of grants) {
    const granted = await coinOps.grantStackable(
      entry.rows,
      entry.count,
      entry.typeId,
      COIN_STACK_LIMIT,
      "bank-withdraw",
      after,
      [],
      backpack,
    );
    if (!granted) {
      // a partial grant may already be written; roll everything back
      throw new TransactionRollback<BankWithdrawResult>({
        status: "no-space",
      });
    }
  }
  const balanceAfter = await debitBankBalance(client, characterId, amount);
  await appendBankLedger(client, characterId, "withdraw", amount, balanceAfter);
  await client.query(insertBankWithdrawAuditQuery, [
    characterId,
    amount,
    balanceAfter,
  ]);
  return {
    status: "committed",
    balance: balanceAfter,
    mutation: { after: [...after.values()], removedItemIds: [] },
  };
}
