import { BANK_LIMITS } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { PgItemPersistOps } from "../item/PgItemPersistOps";
import { appendBankLedger } from "./appendBankLedger";
import { creditBankBalance } from "./creditBankBalance";
import { debitBankBalance } from "./debitBankBalance";
import type {
  BankBalanceOp,
  EconomyPersistAudit,
  EconomyPersistPlan,
  ShopStockOp,
} from "./EconomyPersistPlan";
import type { EconomyPersistStore } from "./EconomyPersistStore";
import { lockBankBalance } from "./lockBankBalance";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { insertBankDepositAuditQuery } from "./sql/insertBankDepositAuditQuery";
import { insertPortableSellerSaleAuditQuery } from "./sql/insertPortableSellerSaleAuditQuery";
import { insertBankTransferAuditQuery } from "./sql/insertBankTransferAuditQuery";
import { insertBankWithdrawAuditQuery } from "./sql/insertBankWithdrawAuditQuery";
import { insertShopPurchaseAuditQuery } from "./sql/insertShopPurchaseAuditQuery";
import { insertShopSaleAuditQuery } from "./sql/insertShopSaleAuditQuery";
import { insertShopStockQuery } from "./sql/insertShopStockQuery";
import { lockShopStockQuery } from "./sql/lockShopStockQuery";
import { updateShopStockQuery } from "./sql/updateShopStockQuery";

/**
 * Writes a committed in-memory economy mutation as one transaction: the
 * carried row ops, the bank balance legs, finite stock, and the audit rows all
 * commit together or not at all.
 *
 * Deliberately on `runSerializableTransaction` rather than the item helper:
 * only guaranteed rollbacks (40001, 40P01) are retried. A connection reset
 * leaves the commit outcome ambiguous, and re-running a balance delta could
 * apply it twice.
 *
 * Every guard that misses throws, which poisons the character's write lane and
 * hands them to the resync path — memory and the database have diverged and
 * only committed rows are trustworthy from that point.
 */
export class PgEconomyPersistOps implements EconomyPersistStore {
  constructor(
    private readonly pool: Pool,
    private readonly carried: PgItemPersistOps,
  ) {}

  persist(plan: EconomyPersistPlan): Promise<void> {
    return runSerializableTransaction(this.pool, async (client) => {
      await this.carried.applyPlan(client, plan.carried);
      for (const op of plan.bankOps ?? []) {
        await this.applyBankOp(client, op);
      }
      for (const op of plan.stockOps ?? []) {
        await this.applyStockOp(client, op);
      }
      for (const audit of plan.audits ?? []) {
        await this.insertAudit(client, plan.carried.characterId, audit);
      }
    });
  }

  private async applyBankOp(
    client: PoolClient,
    op: BankBalanceOp,
  ): Promise<void> {
    if (op.delta === 0) return;
    // Locks the row (creating it for a character who has never banked) and
    // reports the committed balance this delta must apply on top of.
    const before = await lockBankBalance(client, op.characterId);
    if (before + op.delta !== op.expectedBalanceAfter) {
      throw new Error(
        `bank balance diverged for character ${op.characterId}: ` +
          `memory expected ${op.expectedBalanceAfter} but the database holds ` +
          `${before} before a ${op.delta} move`,
      );
    }
    if (
      op.expectedBalanceAfter < 0 ||
      op.expectedBalanceAfter > BANK_LIMITS.maxBalance
    ) {
      throw new Error(
        `bank balance ${op.expectedBalanceAfter} is out of range for character ${op.characterId}`,
      );
    }
    const applied =
      op.delta < 0
        ? await debitBankBalance(client, op.characterId, -op.delta)
        : await creditBankBalance(client, op.characterId, op.delta);
    if (applied !== op.expectedBalanceAfter) {
      throw new Error(
        `bank balance write missed for character ${op.characterId}: ` +
          `wrote ${applied}, expected ${op.expectedBalanceAfter}`,
      );
    }
    await appendBankLedger(
      client,
      op.characterId,
      op.ledger,
      Math.abs(op.delta),
      applied,
      op.counterpartyCharacterId,
    );
  }

  private async applyStockOp(
    client: PoolClient,
    op: ShopStockOp,
  ): Promise<void> {
    await client.query(insertShopStockQuery, [
      op.shopId,
      op.offerId,
      op.initialStock,
    ]);
    const locked = await client.query<{
      initial_stock: number;
      remaining_stock: number;
    }>(lockShopStockQuery, [op.shopId, op.offerId]);
    const row = locked.rows[0];
    if (!row) throw new Error("shop stock is missing");
    if (row.initial_stock !== op.initialStock) {
      throw new Error("shop stock does not match the current catalog");
    }
    if (row.remaining_stock - op.amount !== op.expectedRemaining) {
      throw new Error(
        `shop stock diverged for ${op.shopId}/${op.offerId}: memory expected ` +
          `${op.expectedRemaining} but the database holds ${row.remaining_stock} ` +
          `before a ${op.amount} sale`,
      );
    }
    await client.query(updateShopStockQuery, [
      op.shopId,
      op.offerId,
      op.expectedRemaining,
    ]);
  }

  private async insertAudit(
    client: PoolClient,
    characterId: string,
    audit: EconomyPersistAudit,
  ): Promise<void> {
    if (audit.kind === "shop-purchase") {
      await client.query(insertShopPurchaseAuditQuery, [
        characterId,
        audit.npcTypeId,
        audit.shopId,
        audit.offerId,
        audit.itemTypeId,
        audit.amount,
        audit.totalCost,
        audit.bankSpent,
        audit.subtype ?? null,
        audit.stockRemaining ?? null,
        audit.currencyItemTypeId ?? null,
      ]);
      return;
    }
    if (audit.kind === "shop-sale") {
      await client.query(insertShopSaleAuditQuery, [
        characterId,
        audit.npcTypeId,
        audit.shopId,
        audit.offerId,
        audit.itemTypeId,
        audit.amount,
        audit.totalProceeds,
        audit.subtype ?? null,
        audit.currencyItemTypeId ?? null,
        audit.bankCredited,
      ]);
      return;
    }
    if (audit.kind === "portable-seller-sale") {
      await client.query(insertPortableSellerSaleAuditQuery, [
        characterId,
        audit.itemCount,
        audit.stackCount,
        audit.totalProceeds,
        audit.balanceAfter,
      ]);
      return;
    }
    if (audit.kind === "bank-deposit") {
      await client.query(insertBankDepositAuditQuery, [
        characterId,
        audit.amount,
        audit.balanceAfter,
      ]);
      return;
    }
    if (audit.kind === "bank-transfer") {
      await client.query(insertBankTransferAuditQuery, [
        characterId,
        audit.amount,
        audit.toCharacterId,
        audit.balanceAfter,
      ]);
      return;
    }
    await client.query(insertBankWithdrawAuditQuery, [
      characterId,
      audit.amount,
      audit.balanceAfter,
    ]);
  }
}
