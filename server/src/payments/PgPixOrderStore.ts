import type { Pool } from "pg";
import { STORE_LIMITS } from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { coinLedgerInsert } from "../store/sql/coinLedgerInsert";
import { storeAuditInsert } from "../store/sql/storeAuditInsert";
import type {
  PixOrderCreateResult,
  PixOrderRecord,
  PixOrderStatus,
  PixOrderStore,
  PixRefundResult,
  PixSettleResult,
} from "./PixOrderStore";

interface PixOrderRow {
  readonly id: string;
  readonly account_id: string;
  readonly character_id: string | null;
  readonly package_id: string;
  readonly coins: string;
  readonly amount_centavos: string;
  readonly provider_payment_id: string | null;
  readonly brcode: string | null;
  readonly status: PixOrderStatus;
  readonly expires_at: Date;
}

const ORDER_COLUMNS =
  "id, account_id, character_id, package_id, coins, amount_centavos, " +
  "provider_payment_id, brcode, status, expires_at";

const lockOrderByProviderPaymentQuery =
  `SELECT ${ORDER_COLUMNS} FROM pix_orders ` +
  "WHERE provider = 'mercadopago' AND provider_payment_id = $1 FOR UPDATE";

const lockAccountBalanceQuery =
  "SELECT mantus_coins FROM accounts WHERE id = $1 FOR UPDATE";

const writeAccountBalanceQuery =
  "UPDATE accounts SET mantus_coins = $2 WHERE id = $1";

export class PgPixOrderStore implements PixOrderStore {
  constructor(private readonly pool: Pool) {}

  async createOrder(input: {
    readonly orderId: string;
    readonly accountId: string;
    readonly characterId: string | null;
    readonly packageId: string;
    readonly coins: number;
    readonly amountCentavos: number;
    readonly expiresAt: Date;
  }): Promise<PixOrderCreateResult> {
    if (
      !Number.isSafeInteger(input.coins) ||
      input.coins < 1 ||
      !Number.isSafeInteger(input.amountCentavos) ||
      input.amountCentavos < 1
    ) {
      throw new Error("invalid pix order");
    }
    return runSerializableTransaction(this.pool, async (client) => {
      const inserted = await client.query<PixOrderRow>(
        `INSERT INTO pix_orders (
           id, account_id, character_id, package_id, coins, amount_centavos,
           provider, status, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'mercadopago', 'pending', $7)
         ON CONFLICT (account_id) WHERE status = 'pending' DO NOTHING
         RETURNING ${ORDER_COLUMNS}`,
        [
          input.orderId,
          input.accountId,
          input.characterId,
          input.packageId,
          input.coins,
          input.amountCentavos,
          input.expiresAt,
        ],
      );
      const row = inserted.rows[0];
      if (!row) {
        const existing = await client.query<PixOrderRow>(
          `SELECT ${ORDER_COLUMNS} FROM pix_orders
           WHERE account_id = $1 AND status = 'pending'`,
          [input.accountId],
        );
        const openRow = existing.rows[0];
        if (!openRow) throw new Error("pix order create raced");
        throw new TransactionRollback<PixOrderCreateResult>({
          status: "pending-order-exists",
          order: recordOf(openRow),
        });
      }
      await client.query(storeAuditInsert, [
        "pix-order-created",
        input.characterId,
        JSON.stringify({
          orderId: input.orderId,
          accountId: input.accountId,
          packageId: input.packageId,
          coins: input.coins,
          amountCentavos: input.amountCentavos,
        }),
      ]);
      return { status: "created" as const, order: recordOf(row) };
    });
  }

  async attachCharge(input: {
    readonly orderId: string;
    readonly providerPaymentId: string;
    readonly brcode: string;
  }): Promise<PixOrderRecord | null> {
    const updated = await this.pool.query<PixOrderRow>(
      `UPDATE pix_orders
       SET provider_payment_id = $2, brcode = $3
       WHERE id = $1 AND status = 'pending'
         AND (provider_payment_id IS NULL OR provider_payment_id = $2)
       RETURNING ${ORDER_COLUMNS}`,
      [input.orderId, input.providerPaymentId, input.brcode],
    );
    const row = updated.rows[0];
    return row ? recordOf(row) : null;
  }

  async openOrderFor(accountId: string): Promise<PixOrderRecord | null> {
    const result = await this.pool.query<PixOrderRow>(
      `SELECT ${ORDER_COLUMNS} FROM pix_orders
       WHERE account_id = $1 AND status = 'pending'`,
      [accountId],
    );
    const row = result.rows[0];
    return row ? recordOf(row) : null;
  }

  async cancelOrder(input: {
    readonly orderId: string;
    readonly accountId: string;
    readonly characterId: string | null;
  }): Promise<"cancelled" | "not-found"> {
    return runSerializableTransaction(this.pool, async (client) => {
      const updated = await client.query<PixOrderRow>(
        `UPDATE pix_orders SET status = 'cancelled'
         WHERE id = $1 AND account_id = $2 AND status = 'pending'
         RETURNING ${ORDER_COLUMNS}`,
        [input.orderId, input.accountId],
      );
      const row = updated.rows[0];
      if (!row) {
        throw new TransactionRollback<"not-found">("not-found");
      }
      await client.query(storeAuditInsert, [
        "pix-order-cancelled",
        input.characterId,
        JSON.stringify({
          orderId: row.id,
          accountId: row.account_id,
          providerPaymentId: row.provider_payment_id,
          source: "player",
        }),
      ]);
      return "cancelled" as const;
    });
  }

  async settleApproved(input: {
    readonly providerPaymentId: string;
    readonly amountCentavos: number | null;
    readonly snapshot: Record<string, unknown>;
  }): Promise<PixSettleResult> {
    const snapshot = JSON.stringify(input.snapshot);
    return runSerializableTransaction(this.pool, async (client) => {
      const locked = await client.query<PixOrderRow>(
        lockOrderByProviderPaymentQuery,
        [input.providerPaymentId],
      );
      const order = locked.rows[0];
      if (!order) {
        throw new TransactionRollback<PixSettleResult>({
          status: "not-found",
        });
      }
      if (order.status === "credited" || order.status === "refunded") {
        throw new TransactionRollback<PixSettleResult>({
          status: "already-settled",
          orderId: order.id,
        });
      }
      const coins = Number(order.coins);
      const amountCentavos = Number(order.amount_centavos);
      if (
        input.amountCentavos !== null &&
        input.amountCentavos !== amountCentavos
      ) {
        await client.query(
          `UPDATE pix_orders SET provider_snapshot = $2::jsonb WHERE id = $1`,
          [order.id, snapshot],
        );
        return { status: "amount-mismatch" as const, orderId: order.id };
      }
      const account = await client.query<{ mantus_coins: string }>(
        lockAccountBalanceQuery,
        [order.account_id],
      );
      const accountRow = account.rows[0];
      if (!accountRow) {
        throw new TransactionRollback<PixSettleResult>({
          status: "not-found",
        });
      }
      const balanceAfter = Number(accountRow.mantus_coins) + coins;
      if (balanceAfter > STORE_LIMITS.maxBalance) {
        await client.query(
          `UPDATE pix_orders
           SET status = 'paid', paid_at = COALESCE(paid_at, now()),
               provider_snapshot = $2::jsonb
           WHERE id = $1`,
          [order.id, snapshot],
        );
        return { status: "balance-limit" as const, orderId: order.id };
      }
      const ledger = await client.query(coinLedgerInsert, [
        order.account_id,
        "grant",
        coins,
        balanceAfter,
        null,
        `pix-credit:${order.id}`,
        null,
        null,
      ]);
      if (ledger.rowCount !== 1) {
        throw new TransactionRollback<PixSettleResult>({
          status: "already-settled",
          orderId: order.id,
        });
      }
      await client.query(writeAccountBalanceQuery, [
        order.account_id,
        balanceAfter,
      ]);
      await client.query(
        `UPDATE pix_orders
         SET status = 'credited', paid_at = COALESCE(paid_at, now()),
             credited_at = now(), provider_snapshot = $2::jsonb
         WHERE id = $1`,
        [order.id, snapshot],
      );
      await client.query(storeAuditInsert, [
        "pix-coin-credit",
        order.character_id,
        JSON.stringify({
          orderId: order.id,
          accountId: order.account_id,
          packageId: order.package_id,
          providerPaymentId: input.providerPaymentId,
          coins,
          amountCentavos,
          balanceAfter,
        }),
      ]);
      return {
        status: "credited" as const,
        orderId: order.id,
        accountId: order.account_id,
        characterId: order.character_id,
        coins,
        balance: balanceAfter,
      };
    });
  }

  async markRefunded(input: {
    readonly providerPaymentId: string;
    readonly snapshot: Record<string, unknown>;
  }): Promise<PixRefundResult> {
    const snapshot = JSON.stringify(input.snapshot);
    return runSerializableTransaction(this.pool, async (client) => {
      const locked = await client.query<PixOrderRow>(
        lockOrderByProviderPaymentQuery,
        [input.providerPaymentId],
      );
      const order = locked.rows[0];
      if (!order) {
        throw new TransactionRollback<PixRefundResult>({ status: "not-found" });
      }
      if (order.status === "refunded") {
        throw new TransactionRollback<PixRefundResult>({
          status: "already-refunded",
          orderId: order.id,
        });
      }
      const coins = Number(order.coins);
      let coinsDebited = 0;
      let balanceAfter = 0;
      if (order.status === "credited") {
        const account = await client.query<{ mantus_coins: string }>(
          lockAccountBalanceQuery,
          [order.account_id],
        );
        const accountRow = account.rows[0];
        if (!accountRow) {
          throw new TransactionRollback<PixRefundResult>({
            status: "not-found",
          });
        }
        const balance = Number(accountRow.mantus_coins);
        coinsDebited = Math.min(balance, coins);
        balanceAfter = balance - coinsDebited;
        if (coinsDebited > 0) {
          const ledger = await client.query(coinLedgerInsert, [
            order.account_id,
            "refund",
            -coinsDebited,
            balanceAfter,
            null,
            `pix-refund:${order.id}`,
            null,
            null,
          ]);
          if (ledger.rowCount !== 1) {
            throw new TransactionRollback<PixRefundResult>({
              status: "already-refunded",
              orderId: order.id,
            });
          }
          await client.query(writeAccountBalanceQuery, [
            order.account_id,
            balanceAfter,
          ]);
        }
      }
      await client.query(
        `UPDATE pix_orders
         SET status = 'refunded', refunded_at = now(),
             provider_snapshot = $2::jsonb
         WHERE id = $1`,
        [order.id, snapshot],
      );
      await client.query(storeAuditInsert, [
        "pix-refund",
        order.character_id,
        JSON.stringify({
          orderId: order.id,
          accountId: order.account_id,
          providerPaymentId: input.providerPaymentId,
          coinsDebited,
          shortfall: order.status === "credited" ? coins - coinsDebited : 0,
          balanceAfter,
        }),
      ]);
      return {
        status: "refunded" as const,
        orderId: order.id,
        accountId: order.account_id,
        coinsDebited,
        balance: balanceAfter,
      };
    });
  }

  async markProviderCancelled(
    providerPaymentId: string,
  ): Promise<PixOrderRecord | null> {
    return runSerializableTransaction(this.pool, async (client) => {
      const updated = await client.query<PixOrderRow>(
        `UPDATE pix_orders SET status = 'cancelled'
         WHERE provider = 'mercadopago' AND provider_payment_id = $1
           AND status = 'pending'
         RETURNING ${ORDER_COLUMNS}`,
        [providerPaymentId],
      );
      const row = updated.rows[0];
      if (!row) throw new TransactionRollback<PixOrderRecord | null>(null);
      await client.query(storeAuditInsert, [
        "pix-order-cancelled",
        row.character_id,
        JSON.stringify({
          orderId: row.id,
          accountId: row.account_id,
          providerPaymentId,
          source: "provider",
        }),
      ]);
      return recordOf(row);
    });
  }

  async expireStale(now: Date): Promise<ReadonlyArray<PixOrderRecord>> {
    return runSerializableTransaction(this.pool, async (client) => {
      const updated = await client.query<PixOrderRow>(
        `UPDATE pix_orders SET status = 'expired'
         WHERE status = 'pending' AND expires_at < $1
         RETURNING ${ORDER_COLUMNS}`,
        [now],
      );
      for (const row of updated.rows) {
        await client.query(storeAuditInsert, [
          "pix-order-expired",
          row.character_id,
          JSON.stringify({
            orderId: row.id,
            accountId: row.account_id,
            providerPaymentId: row.provider_payment_id,
          }),
        ]);
      }
      return updated.rows.map(recordOf);
    });
  }

  async openForReconciliation(
    olderThan: Date,
    limit: number,
  ): Promise<ReadonlyArray<PixOrderRecord>> {
    const bounded = Math.min(Math.max(1, Math.trunc(limit)), 200);
    const result = await this.pool.query<PixOrderRow>(
      `SELECT ${ORDER_COLUMNS} FROM pix_orders
       WHERE provider_payment_id IS NOT NULL
         AND (status = 'paid'
              OR (status = 'pending' AND created_at < $1))
       ORDER BY created_at
       LIMIT $2`,
      [olderThan, bounded],
    );
    return result.rows.map(recordOf);
  }
}

function recordOf(row: PixOrderRow): PixOrderRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    characterId: row.character_id,
    packageId: row.package_id,
    coins: Number(row.coins),
    amountCentavos: Number(row.amount_centavos),
    providerPaymentId: row.provider_payment_id,
    brcode: row.brcode,
    status: row.status,
    expiresAt: row.expires_at,
  };
}
