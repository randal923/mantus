import type { Pool, PoolClient } from "pg";
import { STORE_LIMITS } from "@tibia/protocol";
import { isSerializationFailure } from "../economy/isSerializationFailure";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { coinLedgerInsert } from "../store/sql/coinLedgerInsert";
import { storeAuditInsert } from "../store/sql/storeAuditInsert";
import type {
  PixOperatorCreditResult,
  PixOrderCreateResult,
  PixOrderRecord,
  PixOrderStatus,
  PixOrderStore,
  PixRefundResult,
  PixSettleRefusal,
  PixSettleResult,
} from "./PixOrderStore";

interface PixOrderRow {
  readonly id: string;
  readonly account_id: string;
  readonly character_id: string | null;
  readonly package_id: string;
  readonly coins: string;
  readonly amount_centavos: string;
  readonly refunded_centavos: string;
  readonly provider_payment_id: string | null;
  readonly brcode: string | null;
  readonly status: PixOrderStatus;
  readonly created_at: Date;
  readonly expires_at: Date;
}

const ORDER_COLUMNS =
  "id, account_id, character_id, package_id, coins, amount_centavos, " +
  "refunded_centavos, provider_payment_id, brcode, status, created_at, " +
  "expires_at";

const lockOrderByProviderPaymentQuery =
  `SELECT ${ORDER_COLUMNS} FROM pix_orders ` +
  "WHERE provider = 'mercadopago' AND provider_payment_id = $1 FOR UPDATE";

const lockOrderByIdQuery = `SELECT ${ORDER_COLUMNS} FROM pix_orders WHERE id = $1 FOR UPDATE`;

const lockAccountBalanceQuery =
  "SELECT mantus_coins FROM accounts WHERE id = $1 FOR UPDATE";

const writeAccountBalanceQuery =
  "UPDATE accounts SET mantus_coins = $2 WHERE id = $1";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Money paths retry serialization aborts harder than the shared helper's
 * five attempts: a webhook burst plus the sweep plus a player cancel can pile
 * a dozen SERIALIZABLE transactions onto the same index pages, and giving up
 * would surface as a lost settle that only the next sweep repairs.
 */
const OUTER_ATTEMPTS = 4;
const OUTER_BACKOFF_MS = 40;

export class PgPixOrderStore implements PixOrderStore {
  constructor(private readonly pool: Pool) {}

  private async run<T>(
    operation: Parameters<typeof runSerializableTransaction<T>>[1],
  ): Promise<T> {
    let lastCause: unknown;
    for (let attempt = 0; attempt < OUTER_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        const jitter = Math.floor(Math.random() * OUTER_BACKOFF_MS);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, OUTER_BACKOFF_MS * attempt + jitter);
        });
      }
      try {
        return await runSerializableTransaction(this.pool, operation);
      } catch (cause) {
        if (!isSerializationFailure(cause)) throw cause;
        lastCause = cause;
      }
    }
    throw lastCause;
  }

  async createOrder(input: {
    readonly orderId: string;
    readonly accountId: string;
    readonly characterId: string | null;
    readonly packageId: string;
    readonly coins: number;
    readonly amountCentavos: number;
    readonly expiresAt: Date;
    readonly maxPerHour: number;
  }): Promise<PixOrderCreateResult> {
    if (
      !Number.isSafeInteger(input.coins) ||
      input.coins < 1 ||
      !Number.isSafeInteger(input.amountCentavos) ||
      input.amountCentavos < 1 ||
      !Number.isSafeInteger(input.maxPerHour) ||
      input.maxPerHour < 1
    ) {
      throw new Error("invalid pix order");
    }
    return this.run(async (client) => {
      // Lock the account row first: the hourly count and the insert below
      // are then serialized per account, so a burst cannot slip N orders
      // past a limit of N-1 between two reads.
      const account = await client.query(
        "SELECT id FROM accounts WHERE id = $1 FOR UPDATE",
        [input.accountId],
      );
      if (account.rowCount !== 1) throw new Error("pix order: no such account");
      const existing = await client.query<PixOrderRow>(
        `SELECT ${ORDER_COLUMNS} FROM pix_orders
         WHERE account_id = $1 AND status = 'pending'`,
        [input.accountId],
      );
      const openRow = existing.rows[0];
      if (openRow) {
        throw new TransactionRollback<PixOrderCreateResult>({
          status: "pending-order-exists",
          order: recordOf(openRow),
        });
      }
      const recent = await client.query<{ count: string }>(
        `SELECT count(*) FROM pix_orders
         WHERE account_id = $1 AND created_at > now() - interval '1 hour'`,
        [input.accountId],
      );
      const recentCount = Number(recent.rows[0]?.count ?? 0);
      if (recentCount >= input.maxPerHour) {
        throw new TransactionRollback<PixOrderCreateResult>({
          status: "too-many-orders",
          recentCount,
        });
      }
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
      if (!row) throw new Error("pix order create raced");
      await client.query(storeAuditInsert, [
        "pix-order-created",
        input.characterId,
        JSON.stringify({
          orderId: input.orderId,
          accountId: input.accountId,
          packageId: input.packageId,
          coins: input.coins,
          amountCentavos: input.amountCentavos,
          recentOrders: recentCount,
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
       SET provider_payment_id = $2, brcode = COALESCE(brcode, $3)
       WHERE id = $1
         AND ((status = 'pending' AND provider_payment_id IS NULL)
              OR provider_payment_id = $2)
       RETURNING ${ORDER_COLUMNS}`,
      [input.orderId, input.providerPaymentId, input.brcode],
    );
    const row = updated.rows[0];
    return row ? recordOf(row) : null;
  }

  async adoptPayment(input: {
    readonly orderId: string;
    readonly providerPaymentId: string;
  }): Promise<PixOrderRecord | null> {
    if (!UUID_PATTERN.test(input.orderId)) return null;
    return this.run(async (client) => {
      const updated = await client.query<PixOrderRow>(
        `UPDATE pix_orders SET provider_payment_id = $2
         WHERE id = $1 AND provider_payment_id IS NULL
           AND status IN ('pending', 'expired', 'cancelled')
         RETURNING ${ORDER_COLUMNS}`,
        [input.orderId, input.providerPaymentId],
      );
      const row = updated.rows[0];
      if (!row) throw new TransactionRollback<PixOrderRecord | null>(null);
      await client.query(storeAuditInsert, [
        "pix-payment-adopted",
        row.character_id,
        JSON.stringify({
          orderId: row.id,
          accountId: row.account_id,
          providerPaymentId: input.providerPaymentId,
          orderStatus: row.status,
        }),
      ]);
      return recordOf(row);
    });
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

  async orderById(orderId: string): Promise<PixOrderRecord | null> {
    if (!UUID_PATTERN.test(orderId)) return null;
    const result = await this.pool.query<PixOrderRow>(
      `SELECT ${ORDER_COLUMNS} FROM pix_orders WHERE id = $1`,
      [orderId],
    );
    const row = result.rows[0];
    return row ? recordOf(row) : null;
  }

  async recentOrdersForAccount(
    accountId: string,
    limit: number,
  ): Promise<ReadonlyArray<PixOrderRecord>> {
    const bounded = Math.min(Math.max(1, Math.trunc(limit)), 50);
    const result = await this.pool.query<PixOrderRow>(
      `SELECT ${ORDER_COLUMNS} FROM pix_orders
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [accountId, bounded],
    );
    return result.rows.map(recordOf);
  }

  async accountIdByCharacterName(
    normalizedName: string,
  ): Promise<string | null> {
    const result = await this.pool.query<{ account_id: string }>(
      "SELECT account_id FROM characters WHERE normalized_name = $1",
      [normalizedName],
    );
    return result.rows[0]?.account_id ?? null;
  }

  async cancelOrder(input: {
    readonly orderId: string;
    readonly accountId: string;
    readonly characterId: string | null;
  }): Promise<"cancelled" | "not-found"> {
    return this.run(async (client) => {
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
    readonly currency: string | null;
    readonly externalReference: string | null;
    readonly snapshot: Record<string, unknown>;
  }): Promise<PixSettleResult> {
    const snapshot = JSON.stringify(input.snapshot);
    return this.run(async (client) => {
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
      const amountCentavos = Number(order.amount_centavos);
      const refusal = settleRefusalOf(order, input);
      if (refusal !== null) {
        if (order.status !== "refused") {
          await client.query(
            `UPDATE pix_orders
             SET status = 'refused', provider_snapshot = $2::jsonb
             WHERE id = $1`,
            [order.id, snapshot],
          );
          await client.query(storeAuditInsert, [
            "pix-settle-refused",
            order.character_id,
            JSON.stringify({
              orderId: order.id,
              accountId: order.account_id,
              providerPaymentId: input.providerPaymentId,
              reason: refusal,
              previousStatus: order.status,
              expectedAmountCentavos: amountCentavos,
              reportedAmountCentavos: input.amountCentavos,
              reportedCurrency: input.currency,
              reportedReference: input.externalReference,
            }),
          ]);
        }
        return {
          status: "refused" as const,
          reason: refusal,
          orderId: order.id,
        };
      }
      return creditOrder(client, order, {
        providerPaymentId: input.providerPaymentId,
        snapshot,
        auditEvent: "pix-coin-credit",
        auditExtra: {},
      });
    });
  }

  async operatorCredit(input: {
    readonly orderId: string;
    readonly operatorCharacterId: string;
  }): Promise<PixOperatorCreditResult> {
    if (!UUID_PATTERN.test(input.orderId)) return { status: "not-found" };
    return this.run(async (client) => {
      const locked = await client.query<PixOrderRow>(lockOrderByIdQuery, [
        input.orderId,
      ]);
      const order = locked.rows[0];
      if (!order) {
        throw new TransactionRollback<PixOperatorCreditResult>({
          status: "not-found",
        });
      }
      if (order.status !== "refused") {
        throw new TransactionRollback<PixOperatorCreditResult>({
          status: "not-refused",
          orderId: order.id,
          orderStatus: order.status,
        });
      }
      return creditOrder(client, order, {
        providerPaymentId: order.provider_payment_id ?? "",
        snapshot: null,
        auditEvent: "pix-operator-credit",
        auditExtra: { operatorCharacterId: input.operatorCharacterId },
      });
    });
  }

  async markRefunded(input: {
    readonly providerPaymentId: string;
    readonly externalReference: string | null;
    readonly refundedCentavos: number | null;
    readonly snapshot: Record<string, unknown>;
    readonly operatorCharacterId?: string;
  }): Promise<PixRefundResult> {
    const snapshot = JSON.stringify(input.snapshot);
    if (
      input.refundedCentavos !== null &&
      (!Number.isSafeInteger(input.refundedCentavos) ||
        input.refundedCentavos < 0)
    ) {
      throw new Error("invalid refunded amount");
    }
    return this.run(async (client) => {
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
      if (
        input.externalReference !== null &&
        input.externalReference !== order.id
      ) {
        throw new TransactionRollback<PixRefundResult>({
          status: "refused",
          reason: "reference-mismatch",
          orderId: order.id,
        });
      }
      const coins = Number(order.coins);
      const amountCentavos = Number(order.amount_centavos);
      const alreadyRefunded = Number(order.refunded_centavos);
      const refundedNow = Math.min(
        input.refundedCentavos ?? amountCentavos,
        amountCentavos,
      );
      if (refundedNow <= alreadyRefunded) {
        throw new TransactionRollback<PixRefundResult>({
          status: "already-refunded",
          orderId: order.id,
        });
      }
      const complete = refundedNow >= amountCentavos;
      // Coins owed back for the cumulative refunded share, minus what earlier
      // partial refunds already clawed back; ceil so the player never keeps a
      // fraction of a coin the money no longer covers.
      const coinsOwedTotal = complete
        ? coins
        : Math.ceil((coins * refundedNow) / amountCentavos);
      const coinsOwedBefore =
        alreadyRefunded <= 0
          ? 0
          : Math.ceil((coins * alreadyRefunded) / amountCentavos);
      const coinsOwed = Math.max(0, coinsOwedTotal - coinsOwedBefore);
      let coinsDebited = 0;
      let balanceBefore = 0;
      let balanceAfter = 0;
      if (order.status === "credited" && coinsOwed > 0) {
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
        balanceBefore = Number(accountRow.mantus_coins);
        coinsDebited = Math.min(balanceBefore, coinsOwed);
        balanceAfter = balanceBefore - coinsDebited;
        if (coinsDebited > 0) {
          const ledger = await client.query(coinLedgerInsert, [
            order.account_id,
            "refund",
            -coinsDebited,
            balanceAfter,
            null,
            complete
              ? `pix-refund:${order.id}`
              : `pix-refund:${order.id}:${refundedNow}`,
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
        complete
          ? `UPDATE pix_orders
             SET status = 'refunded', refunded_at = now(),
                 refunded_centavos = $2, provider_snapshot = $3::jsonb
             WHERE id = $1`
          : `UPDATE pix_orders
             SET refunded_centavos = $2, provider_snapshot = $3::jsonb
             WHERE id = $1`,
        [order.id, refundedNow, snapshot],
      );
      await client.query(storeAuditInsert, [
        input.operatorCharacterId ? "pix-operator-refund" : "pix-refund",
        input.operatorCharacterId ?? order.character_id,
        JSON.stringify({
          orderId: order.id,
          accountId: order.account_id,
          providerPaymentId: input.providerPaymentId,
          previousStatus: order.status,
          complete,
          coins,
          amountCentavos,
          refundedCentavosBefore: alreadyRefunded,
          refundedCentavos: refundedNow,
          coinsOwed,
          coinsDebited,
          shortfall: order.status === "credited" ? coinsOwed - coinsDebited : 0,
          balanceBefore,
          balanceAfter,
          ...(input.operatorCharacterId
            ? { operatorCharacterId: input.operatorCharacterId }
            : {}),
        }),
      ]);
      return {
        status: "refunded" as const,
        orderId: order.id,
        accountId: order.account_id,
        coinsDebited,
        balance: balanceAfter,
        complete,
      };
    });
  }

  async markProviderCancelled(
    providerPaymentId: string,
  ): Promise<PixOrderRecord | null> {
    return this.run(async (client) => {
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
    return this.run(async (client) => {
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

  async claimForReconciliation(
    olderThan: Date,
    limit: number,
  ): Promise<ReadonlyArray<PixOrderRecord>> {
    const bounded = Math.min(Math.max(1, Math.trunc(limit)), 200);
    const result = await this.pool.query<PixOrderRow>(
      `UPDATE pix_orders SET last_checked_at = now()
       WHERE id IN (
         SELECT id FROM pix_orders
         WHERE provider_payment_id IS NOT NULL
           AND (status = 'paid'
                OR (status = 'pending' AND created_at < $1))
         ORDER BY last_checked_at ASC NULLS FIRST, created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       RETURNING ${ORDER_COLUMNS}`,
      [olderThan, bounded],
    );
    return result.rows
      .map(recordOf)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async recordOperatorInspect(input: {
    readonly operatorCharacterId: string;
    readonly subject: string;
  }): Promise<void> {
    await this.pool.query(storeAuditInsert, [
      "pix-operator-inspect",
      input.operatorCharacterId,
      JSON.stringify({
        operatorCharacterId: input.operatorCharacterId,
        subject: input.subject.slice(0, 128),
      }),
    ]);
  }
}

/**
 * The single place coins are created from a Pix order: locks the account,
 * enforces the balance cap (parking the order as `paid`), appends the ledger
 * row under the order's idempotency key, writes the balance and flips the
 * order. Used by the provider-verified settle and the operator override.
 */
async function creditOrder(
  client: PoolClient,
  order: PixOrderRow,
  input: {
    readonly providerPaymentId: string;
    readonly snapshot: string | null;
    readonly auditEvent: "pix-coin-credit" | "pix-operator-credit";
    readonly auditExtra: Record<string, unknown>;
  },
): Promise<PixSettleResult> {
  const coins = Number(order.coins);
  const amountCentavos = Number(order.amount_centavos);
  const account = await client.query<{ mantus_coins: string }>(
    lockAccountBalanceQuery,
    [order.account_id],
  );
  const accountRow = account.rows[0];
  if (!accountRow) {
    throw new TransactionRollback<PixSettleResult>({ status: "not-found" });
  }
  const balanceBefore = Number(accountRow.mantus_coins);
  const balanceAfter = balanceBefore + coins;
  if (balanceAfter > STORE_LIMITS.maxBalance) {
    await client.query(
      `UPDATE pix_orders
       SET status = 'paid', paid_at = COALESCE(paid_at, now()),
           provider_snapshot = COALESCE($2::jsonb, provider_snapshot)
       WHERE id = $1`,
      [order.id, input.snapshot],
    );
    if (order.status !== "paid") {
      await client.query(storeAuditInsert, [
        "pix-credit-parked",
        order.character_id,
        JSON.stringify({
          orderId: order.id,
          accountId: order.account_id,
          providerPaymentId: input.providerPaymentId,
          coins,
          balance: balanceBefore,
          maxBalance: STORE_LIMITS.maxBalance,
          ...input.auditExtra,
        }),
      ]);
    }
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
         credited_at = now(),
         provider_snapshot = COALESCE($2::jsonb, provider_snapshot)
     WHERE id = $1`,
    [order.id, input.snapshot],
  );
  await client.query(storeAuditInsert, [
    input.auditEvent,
    order.character_id,
    JSON.stringify({
      orderId: order.id,
      accountId: order.account_id,
      packageId: order.package_id,
      providerPaymentId: input.providerPaymentId,
      previousStatus: order.status,
      coins,
      amountCentavos,
      balanceBefore,
      balanceAfter,
      ...input.auditExtra,
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
}

/**
 * Charter rule 1: the provider's report is data, not truth. A payment is
 * credited only when everything it reports agrees with the order we created
 * — the amount we charged, the currency we sell in, and the order id we
 * stamped as the external reference. Anything else is refused and parked for
 * an operator; there is no "close enough" path to coins.
 */
function settleRefusalOf(
  order: PixOrderRow,
  input: {
    readonly amountCentavos: number | null;
    readonly currency: string | null;
    readonly externalReference: string | null;
  },
): PixSettleRefusal | null {
  if (
    input.externalReference !== null &&
    input.externalReference !== order.id
  ) {
    return "reference-mismatch";
  }
  if (input.currency !== null && input.currency !== "BRL") {
    return "currency-mismatch";
  }
  if (input.amountCentavos === null) return "amount-unknown";
  if (input.amountCentavos !== Number(order.amount_centavos)) {
    return "amount-mismatch";
  }
  return null;
}

function recordOf(row: PixOrderRow): PixOrderRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    characterId: row.character_id,
    packageId: row.package_id,
    coins: Number(row.coins),
    amountCentavos: Number(row.amount_centavos),
    refundedCentavos: Number(row.refunded_centavos),
    providerPaymentId: row.provider_payment_id,
    brcode: row.brcode,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
