import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { STORE_LIMITS } from "@tibia/protocol";
import { applyMigrations } from "../test/applyMigrations";
import { PgPixOrderStore } from "./PgPixOrderStore";
import type { PixOrderRecord } from "./PixOrderStore";

const TEST_SCHEMA = "pix_orders_integration";
const MIGRATION_LOCK_KEY = 7_281_099;
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

let setupClient: Client;
let pool: Pool;
let store: PgPixOrderStore;
let accountId: string;
let characterId: string;

const setCoins = async (amount: number, account = accountId): Promise<void> => {
  await pool.query("UPDATE accounts SET mantus_coins = $2 WHERE id = $1", [
    account,
    amount,
  ]);
};

const coinsOf = async (account = accountId): Promise<number> => {
  const result = await pool.query<{ mantus_coins: string }>(
    "SELECT mantus_coins FROM accounts WHERE id = $1",
    [account],
  );
  return Number(result.rows[0]?.mantus_coins);
};

const orderStatusOf = async (orderId: string): Promise<string | undefined> => {
  const result = await pool.query<{ status: string }>(
    "SELECT status FROM pix_orders WHERE id = $1",
    [orderId],
  );
  return result.rows[0]?.status;
};

const auditCountOf = async (eventType: string): Promise<number> => {
  const result = await pool.query<{ count: string }>(
    "SELECT count(*) FROM audit_log WHERE event_type = $1",
    [eventType],
  );
  return Number(result.rows[0]?.count);
};

const auditDetailsOf = async (
  eventType: string,
): Promise<Record<string, unknown>[]> => {
  const result = await pool.query<{ details: Record<string, unknown> }>(
    "SELECT details FROM audit_log WHERE event_type = $1 ORDER BY id",
    [eventType],
  );
  return result.rows.map((row) => row.details);
};

const ledgerRowsOf = async (
  account = accountId,
): Promise<
  Array<{
    entry_type: string;
    amount: number;
    balance_after: number;
    request_key: string | null;
  }>
> => {
  const result = await pool.query<{
    entry_type: string;
    amount: string;
    balance_after: string;
    request_key: string | null;
  }>(
    `SELECT entry_type, amount, balance_after, request_key
     FROM mantus_coin_ledger WHERE account_id = $1 ORDER BY id`,
    [account],
  );
  return result.rows.map((row) => ({
    entry_type: row.entry_type,
    amount: Number(row.amount),
    balance_after: Number(row.balance_after),
    request_key: row.request_key,
  }));
};

const insertAccount = async (): Promise<string> => {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (supabase_user_id, language, mantus_coins)
     VALUES ($1, 'en', 0)
     RETURNING id`,
    [`pix-${randomUUID()}`],
  );
  return account.rows[0]!.id;
};

const createAttached = async (
  paymentId: string,
  expiresAt = new Date(Date.now() + 60 * 60_000),
  account = accountId,
): Promise<PixOrderRecord> => {
  const created = await store.createOrder({
    orderId: randomUUID(),
    accountId: account,
    characterId: account === accountId ? characterId : null,
    packageId: "coins-100",
    coins: 100,
    amountCentavos: 1_000,
    expiresAt,
    maxPerHour: 10,
  });
  expect(created.status).toBe("created");
  if (created.status !== "created") throw new Error(created.status);
  const attached = await store.attachCharge({
    orderId: created.order.id,
    providerPaymentId: paymentId,
    brcode: "00020126pixpayload6304ABCD",
  });
  expect(attached).not.toBeNull();
  return attached!;
};

const createStranded = async (
  account = accountId,
  expiresAt = new Date(Date.now() + 60 * 60_000),
): Promise<PixOrderRecord> => {
  const created = await store.createOrder({
    orderId: randomUUID(),
    accountId: account,
    characterId: account === accountId ? characterId : null,
    packageId: "coins-100",
    coins: 100,
    amountCentavos: 1_000,
    expiresAt,
    maxPerHour: 10,
  });
  if (created.status !== "created") throw new Error(created.status);
  return created.order;
};

const settle = (
  paymentId: string,
  overrides: Partial<Parameters<PgPixOrderStore["settleApproved"]>[0]> = {},
) =>
  store.settleApproved({
    providerPaymentId: paymentId,
    amountCentavos: 1_000,
    currency: "BRL",
    externalReference: null,
    snapshot: { id: paymentId, status: "approved" },
    ...overrides,
  });

const refund = (
  paymentId: string,
  overrides: Partial<Parameters<PgPixOrderStore["markRefunded"]>[0]> = {},
) =>
  store.markRefunded({
    providerPaymentId: paymentId,
    externalReference: null,
    refundedCentavos: null,
    snapshot: { id: paymentId, status: "refunded" },
    ...overrides,
  });

databaseDescribe("PgPixOrderStore integration", () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    setupClient = new Client({ connectionString: databaseUrl });
    await setupClient.connect();
    await setupClient.query("SELECT pg_advisory_lock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    await setupClient.query(`SET search_path TO ${TEST_SCHEMA}`);
    await applyMigrations(setupClient);
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${TEST_SCHEMA}`,
    });
    store = new PgPixOrderStore(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM pix_orders");
    await pool.query("DELETE FROM mantus_coin_ledger");
    await pool.query("DELETE FROM audit_log");
    await pool.query("DELETE FROM characters");
    await pool.query("DELETE FROM accounts");
    accountId = await insertAccount();
    characterId = randomUUID();
    await pool.query(
      `INSERT INTO characters (
         id, account_id, display_name, normalized_name, vocation,
         health, mana,
         position_x, position_y, position_z, direction,
         outfit_look_type, outfit_head, outfit_body, outfit_legs, outfit_feet,
         town_id, sex
       ) VALUES (
         $1, $2, 'Pix Hero', 'pix hero', 'Knight',
         150, 50,
         100, 100, 7, 'south',
         128, 1, 1, 1, 1,
         1, 1
       )`,
      [characterId, accountId],
    );
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await pool.end();
    await setupClient.query("SET search_path TO public");
    await setupClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await setupClient.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY,
    ]);
    await setupClient.end();
  });

  describe("order creation", () => {
    it("allows exactly one open order per account under a create race", async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          store.createOrder({
            orderId: randomUUID(),
            accountId,
            characterId,
            packageId: "coins-100",
            coins: 100,
            amountCentavos: 1_000,
            expiresAt: new Date(Date.now() + 60 * 60_000),
            maxPerHour: 10,
          }),
        ),
      );
      const created = results.filter((entry) => entry.status === "created");
      const refused = results.filter(
        (entry) => entry.status === "pending-order-exists",
      );
      expect(created).toHaveLength(1);
      expect(refused).toHaveLength(4);
      const winner = created[0]!;
      for (const entry of refused) {
        expect(
          entry.status === "pending-order-exists" &&
            winner.status === "created" &&
            entry.order.id,
        ).toBe(winner.status === "created" ? winner.order.id : "");
      }
      const rows = await pool.query(
        "SELECT count(*) FROM pix_orders WHERE status = 'pending'",
      );
      expect(Number(rows.rows[0].count)).toBe(1);
      expect(await auditCountOf("pix-order-created")).toBe(1);
    });

    it("lets two accounts hold open orders at the same time", async () => {
      const other = await insertAccount();
      await createAttached("900000100");
      await createAttached("900000101", undefined, other);
      const rows = await pool.query(
        "SELECT count(*) FROM pix_orders WHERE status = 'pending'",
      );
      expect(Number(rows.rows[0].count)).toBe(2);
    });

    it("writes the order audit row with the character and package that bought it", async () => {
      const order = await createAttached("900000102");
      const [details] = await auditDetailsOf("pix-order-created");
      expect(details).toMatchObject({
        orderId: order.id,
        accountId,
        packageId: "coins-100",
        coins: 100,
        amountCentavos: 1_000,
      });
      const row = await pool.query<{ character_id: string }>(
        "SELECT character_id FROM audit_log WHERE event_type = 'pix-order-created'",
      );
      expect(row.rows[0]?.character_id).toBe(characterId);
    });

    it("rejects non-positive or non-integer amounts before touching the database", async () => {
      const base = {
        orderId: randomUUID(),
        accountId,
        characterId,
        packageId: "coins-100",
        expiresAt: new Date(Date.now() + 60 * 60_000),
        maxPerHour: 10,
      };
      for (const bad of [
        { coins: 0, amountCentavos: 1_000 },
        { coins: -100, amountCentavos: 1_000 },
        { coins: 100, amountCentavos: 0 },
        { coins: 100, amountCentavos: -1 },
        { coins: 10.5, amountCentavos: 1_000 },
        { coins: 100, amountCentavos: 10.5 },
        { coins: Number.NaN, amountCentavos: 1_000 },
        { coins: Number.POSITIVE_INFINITY, amountCentavos: 1_000 },
        { coins: 2 ** 53, amountCentavos: 1_000 },
      ]) {
        await expect(store.createOrder({ ...base, ...bad })).rejects.toThrow(
          "invalid pix order",
        );
      }
      const rows = await pool.query("SELECT count(*) FROM pix_orders");
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("has the database refuse amounts beyond the schema caps even if the store is bypassed", async () => {
      await expect(
        pool.query(
          `INSERT INTO pix_orders (
             id, account_id, character_id, package_id, coins, amount_centavos,
             provider, status, expires_at
           ) VALUES ($1, $2, $3, 'coins-x', 1000001, 1000, 'mercadopago', 'pending', now())`,
          [randomUUID(), accountId, characterId],
        ),
      ).rejects.toThrow(/check/i);
      await expect(
        pool.query(
          `INSERT INTO pix_orders (
             id, account_id, character_id, package_id, coins, amount_centavos,
             provider, status, expires_at
           ) VALUES ($1, $2, $3, 'coins-x', 100, 10000001, 'mercadopago', 'pending', now())`,
          [randomUUID(), accountId, characterId],
        ),
      ).rejects.toThrow(/check/i);
      await expect(
        pool.query(
          `INSERT INTO pix_orders (
             id, account_id, character_id, package_id, coins, amount_centavos,
             provider, status, expires_at
           ) VALUES ($1, $2, $3, 'coins-x', 100, 1000, 'paypal', 'pending', now())`,
          [randomUUID(), accountId, characterId],
        ),
      ).rejects.toThrow(/check/i);
    });

    it("refuses to attach one provider payment to two different orders", async () => {
      const other = await insertAccount();
      await createAttached("900000103");
      const second = await store.createOrder({
        orderId: randomUUID(),
        accountId: other,
        characterId: null,
        packageId: "coins-100",
        coins: 100,
        amountCentavos: 1_000,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        maxPerHour: 10,
      });
      expect(second.status).toBe("created");
      await expect(
        store.attachCharge({
          orderId: second.status === "created" ? second.order.id : "",
          providerPaymentId: "900000103",
          brcode: "dup",
        }),
      ).rejects.toThrow(/unique|duplicate/i);
    });

    it("refuses to overwrite an order's charge with a different one", async () => {
      const order = await createAttached("900000010");
      const overwritten = await store.attachCharge({
        orderId: order.id,
        providerPaymentId: "900000011",
        brcode: "other",
      });
      expect(overwritten).toBeNull();
      const row = await pool.query<{ provider_payment_id: string }>(
        "SELECT provider_payment_id FROM pix_orders WHERE id = $1",
        [order.id],
      );
      expect(row.rows[0]?.provider_payment_id).toBe("900000010");
    });

    it("re-attaching the same charge is idempotent", async () => {
      const order = await createAttached("900000104");
      const again = await store.attachCharge({
        orderId: order.id,
        providerPaymentId: "900000104",
        brcode: "00020126pixpayload6304ABCD",
      });
      expect(again?.id).toBe(order.id);
    });

    it("refuses to attach a charge to an order that is no longer pending", async () => {
      const created = await store.createOrder({
        orderId: randomUUID(),
        accountId,
        characterId,
        packageId: "coins-100",
        coins: 100,
        amountCentavos: 1_000,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        maxPerHour: 10,
      });
      if (created.status !== "created") throw new Error(created.status);
      expect(
        await store.cancelOrder({
          orderId: created.order.id,
          accountId,
          characterId,
        }),
      ).toBe("cancelled");
      const attached = await store.attachCharge({
        orderId: created.order.id,
        providerPaymentId: "900000105",
        brcode: "late",
      });
      expect(attached).toBeNull();
      expect(await settle("900000105")).toEqual({ status: "not-found" });
      expect(await coinsOf()).toBe(0);
    });

    it("only reports an account's own open order", async () => {
      const other = await insertAccount();
      const mine = await createAttached("900000106");
      expect((await store.openOrderFor(accountId))?.id).toBe(mine.id);
      expect(await store.openOrderFor(other)).toBeNull();
    });
  });

  describe("settlement", () => {
    it("credits exactly once when duplicated webhooks race", async () => {
      const paymentId = "900000001";
      const order = await createAttached(paymentId);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => settle(paymentId)),
      );
      const credited = results.filter((entry) => entry.status === "credited");
      expect(credited).toHaveLength(1);
      expect(
        results.filter((entry) => entry.status === "already-settled"),
      ).toHaveLength(7);
      expect(await coinsOf()).toBe(100);
      expect(await orderStatusOf(order.id)).toBe("credited");
      const ledger = await pool.query(
        "SELECT count(*) FROM mantus_coin_ledger WHERE request_key = $1",
        [`pix-credit:${order.id}`],
      );
      expect(Number(ledger.rows[0].count)).toBe(1);
      expect(await auditCountOf("pix-coin-credit")).toBe(1);
    });

    it("treats a replayed settle after commit as a no-op", async () => {
      const paymentId = "900000002";
      await createAttached(paymentId);
      const first = await settle(paymentId);
      expect(first.status).toBe("credited");
      const replay = await settle(paymentId);
      expect(replay.status).toBe("already-settled");
      expect(await coinsOf()).toBe(100);
    });

    it("writes one ledger row whose balance_after matches the account and a joinable audit row", async () => {
      const paymentId = "900000107";
      await setCoins(25);
      const order = await createAttached(paymentId);
      const result = await settle(paymentId);
      expect(result).toMatchObject({
        status: "credited",
        coins: 100,
        balance: 125,
      });
      expect(await ledgerRowsOf()).toEqual([
        {
          entry_type: "grant",
          amount: 100,
          balance_after: 125,
          request_key: `pix-credit:${order.id}`,
        },
      ]);
      const [audit] = await auditDetailsOf("pix-coin-credit");
      expect(audit).toMatchObject({
        orderId: order.id,
        accountId,
        packageId: "coins-100",
        providerPaymentId: paymentId,
        previousStatus: "pending",
        coins: 100,
        amountCentavos: 1_000,
        balanceBefore: 25,
        balanceAfter: 125,
      });
    });

    it("credits the order's own pinned coins, never a value from the provider report", async () => {
      const paymentId = "900000108";
      await createAttached(paymentId);
      await settle(paymentId, {
        snapshot: { transaction_amount: 100_000, coins: 999_999 },
      });
      expect(await coinsOf()).toBe(100);
    });

    it("keeps the provider snapshot on the settled row, whitelisted size and all", async () => {
      const paymentId = "900000109";
      const order = await createAttached(paymentId);
      await settle(paymentId, {
        snapshot: {
          id: paymentId,
          status: "approved",
          date_approved: "2026-08-30T00:00:00Z",
        },
      });
      const row = await pool.query<{
        provider_snapshot: Record<string, unknown>;
        credited_at: Date | null;
        paid_at: Date | null;
      }>(
        "SELECT provider_snapshot, credited_at, paid_at FROM pix_orders WHERE id = $1",
        [order.id],
      );
      expect(row.rows[0]?.provider_snapshot).toEqual({
        id: paymentId,
        status: "approved",
        date_approved: "2026-08-30T00:00:00Z",
      });
      expect(row.rows[0]?.credited_at).not.toBeNull();
      expect(row.rows[0]?.paid_at).not.toBeNull();
    });

    it("never credits a payment whose amount differs from the order, and parks it as refused once", async () => {
      const paymentId = "900000003";
      const order = await createAttached(paymentId);
      const result = await settle(paymentId, { amountCentavos: 1 });
      expect(result).toEqual({
        status: "refused",
        reason: "amount-mismatch",
        orderId: order.id,
      });
      expect(await coinsOf()).toBe(0);
      expect(await orderStatusOf(order.id)).toBe("refused");
      const ledger = await pool.query(
        "SELECT count(*) FROM mantus_coin_ledger",
      );
      expect(Number(ledger.rows[0].count)).toBe(0);
      const again = await settle(paymentId, { amountCentavos: 1 });
      expect(again.status).toBe("refused");
      expect(await auditCountOf("pix-settle-refused")).toBe(1);
      const [audit] = await auditDetailsOf("pix-settle-refused");
      expect(audit).toMatchObject({
        orderId: order.id,
        accountId,
        providerPaymentId: paymentId,
        reason: "amount-mismatch",
        previousStatus: "pending",
        expectedAmountCentavos: 1_000,
        reportedAmountCentavos: 1,
      });
    });

    it("never credits an overpayment either", async () => {
      const paymentId = "900000110";
      await createAttached(paymentId);
      expect(
        (await settle(paymentId, { amountCentavos: 100_000 })).status,
      ).toBe("refused");
      expect(await coinsOf()).toBe(0);
    });

    it("never credits when the provider reports no amount", async () => {
      const paymentId = "900000111";
      const order = await createAttached(paymentId);
      expect(await settle(paymentId, { amountCentavos: null })).toEqual({
        status: "refused",
        reason: "amount-unknown",
        orderId: order.id,
      });
      expect(await coinsOf()).toBe(0);
    });

    it("never credits a payment in another currency", async () => {
      const paymentId = "900000112";
      const order = await createAttached(paymentId);
      expect(await settle(paymentId, { currency: "USD" })).toEqual({
        status: "refused",
        reason: "currency-mismatch",
        orderId: order.id,
      });
      expect(await coinsOf()).toBe(0);
    });

    it("never credits a payment whose external reference names another order", async () => {
      const paymentId = "900000113";
      const order = await createAttached(paymentId);
      expect(
        await settle(paymentId, { externalReference: randomUUID() }),
      ).toEqual({
        status: "refused",
        reason: "reference-mismatch",
        orderId: order.id,
      });
      expect(await coinsOf()).toBe(0);
    });

    it("credits when the external reference matches and the currency is BRL", async () => {
      const paymentId = "900000114";
      const order = await createAttached(paymentId);
      const result = await settle(paymentId, {
        externalReference: order.id,
        currency: "BRL",
      });
      expect(result.status).toBe("credited");
      expect(await coinsOf()).toBe(100);
    });

    it("still credits a refused order once the provider report is corrected", async () => {
      const paymentId = "900000115";
      const order = await createAttached(paymentId);
      expect((await settle(paymentId, { amountCentavos: 1 })).status).toBe(
        "refused",
      );
      const fixed = await settle(paymentId);
      expect(fixed).toMatchObject({ status: "credited", coins: 100 });
      expect(await orderStatusOf(order.id)).toBe("credited");
      expect(await coinsOf()).toBe(100);
      const [audit] = await auditDetailsOf("pix-coin-credit");
      expect(audit).toMatchObject({ previousStatus: "refused" });
    });

    it("lets the player open a new order after one was refused", async () => {
      const paymentId = "900000116";
      await createAttached(paymentId);
      await settle(paymentId, { amountCentavos: 1 });
      const next = await createAttached("900000117");
      expect(next.status).toBe("pending");
    });

    it("still credits an order the player cancelled in the pay race", async () => {
      const paymentId = "900000004";
      const order = await createAttached(paymentId);
      expect(
        await store.cancelOrder({ orderId: order.id, accountId, characterId }),
      ).toBe("cancelled");
      const result = await settle(paymentId);
      expect(result.status).toBe("credited");
      expect(await coinsOf()).toBe(100);
      const [audit] = await auditDetailsOf("pix-coin-credit");
      expect(audit).toMatchObject({ previousStatus: "cancelled" });
    });

    it("still credits an order that expired before the webhook landed", async () => {
      const paymentId = "900000005";
      const order = await createAttached(
        paymentId,
        new Date(Date.now() - 60_000),
      );
      const expired = await store.expireStale(new Date());
      expect(expired.map((entry) => entry.id)).toContain(order.id);
      const result = await settle(paymentId);
      expect(result.status).toBe("credited");
      expect(await coinsOf()).toBe(100);
    });

    it("credits exactly once when the player's cancel races the webhook", async () => {
      const paymentId = "900000118";
      const order = await createAttached(paymentId);
      const results = await Promise.all([
        settle(paymentId),
        store.cancelOrder({ orderId: order.id, accountId, characterId }),
        settle(paymentId),
        store.cancelOrder({ orderId: order.id, accountId, characterId }),
      ]);
      expect(
        results.filter(
          (entry) => typeof entry !== "string" && entry.status === "credited",
        ),
      ).toHaveLength(1);
      expect(await coinsOf()).toBe(100);
      expect(await orderStatusOf(order.id)).toBe("credited");
      expect(await ledgerRowsOf()).toHaveLength(1);
    });

    it("credits exactly once when expiry races the webhook", async () => {
      const paymentId = "900000119";
      const order = await createAttached(
        paymentId,
        new Date(Date.now() - 1_000),
      );
      const results = await Promise.all([
        settle(paymentId),
        store.expireStale(new Date()),
        settle(paymentId),
        store.expireStale(new Date()),
      ]);
      expect(
        results.filter(
          (entry) =>
            !Array.isArray(entry) &&
            (entry as { status: string }).status === "credited",
        ),
      ).toHaveLength(1);
      expect(await coinsOf()).toBe(100);
      expect(await orderStatusOf(order.id)).toBe("credited");
      expect(await ledgerRowsOf()).toHaveLength(1);
    });

    it("cannot be credited twice by racing two orders of the same account", async () => {
      const first = await createAttached("900000120");
      await settle("900000120");
      const second = await createAttached("900000121");
      const results = await Promise.all([
        settle("900000120"),
        settle("900000121"),
        settle("900000120"),
        settle("900000121"),
      ]);
      expect(
        results.filter((entry) => entry.status === "credited"),
      ).toHaveLength(1);
      expect(await coinsOf()).toBe(200);
      expect(await orderStatusOf(first.id)).toBe("credited");
      expect(await orderStatusOf(second.id)).toBe("credited");
    });

    it("keeps concurrent settles of many accounts isolated and complete", async () => {
      const accounts = await Promise.all(
        Array.from({ length: 6 }, () => insertAccount()),
      );
      const orders = await Promise.all(
        accounts.map((account, index) =>
          createAttached(`9000002${index}0`, undefined, account),
        ),
      );
      const results = await Promise.all(
        orders.flatMap((_, index) => [
          settle(`9000002${index}0`),
          settle(`9000002${index}0`),
        ]),
      );
      expect(
        results.filter((entry) => entry.status === "credited"),
      ).toHaveLength(6);
      for (const account of accounts) {
        expect(await coinsOf(account)).toBe(100);
        expect(await ledgerRowsOf(account)).toHaveLength(1);
      }
    });

    it("does not credit a store-side ledger replay: a pre-existing request key blocks the grant", async () => {
      const paymentId = "900000122";
      const order = await createAttached(paymentId);
      await pool.query(
        `INSERT INTO mantus_coin_ledger (account_id, entry_type, amount, balance_after, request_key)
         VALUES ($1, 'grant', 100, 100, $2)`,
        [accountId, `pix-credit:${order.id}`],
      );
      const result = await settle(paymentId);
      expect(result).toEqual({ status: "already-settled", orderId: order.id });
      expect(await coinsOf()).toBe(0);
      expect(await orderStatusOf(order.id)).toBe("pending");
    });

    it("refuses to cancel anything but a pending order", async () => {
      const paymentId = "900000006";
      const order = await createAttached(paymentId);
      await settle(paymentId);
      expect(
        await store.cancelOrder({ orderId: order.id, accountId, characterId }),
      ).toBe("not-found");
      expect(await orderStatusOf(order.id)).toBe("credited");
      expect(await coinsOf()).toBe(100);
    });

    it("refuses to cancel another account's order", async () => {
      const other = await insertAccount();
      const victim = await createAttached("900000123");
      expect(
        await store.cancelOrder({
          orderId: victim.id,
          accountId: other,
          characterId: null,
        }),
      ).toBe("not-found");
      expect(await orderStatusOf(victim.id)).toBe("pending");
      expect(await auditCountOf("pix-order-cancelled")).toBe(0);
    });

    it("cancels a pending order once and audits the player as the source", async () => {
      const order = await createAttached("900000124");
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          store.cancelOrder({ orderId: order.id, accountId, characterId }),
        ),
      );
      expect(results.filter((entry) => entry === "cancelled")).toHaveLength(1);
      expect(await auditCountOf("pix-order-cancelled")).toBe(1);
      const [audit] = await auditDetailsOf("pix-order-cancelled");
      expect(audit).toMatchObject({
        orderId: order.id,
        accountId,
        providerPaymentId: "900000124",
        source: "player",
      });
    });

    it("marks a provider-side cancel only on a pending order and audits the provider as the source", async () => {
      const order = await createAttached("900000125");
      const first = await store.markProviderCancelled("900000125");
      expect(first?.id).toBe(order.id);
      expect(await store.markProviderCancelled("900000125")).toBeNull();
      expect(await store.markProviderCancelled("111")).toBeNull();
      const [audit] = await auditDetailsOf("pix-order-cancelled");
      expect(audit).toMatchObject({ source: "provider" });
      const credited = await createAttached("900000126");
      await settle("900000126");
      expect(await store.markProviderCancelled("900000126")).toBeNull();
      expect(await orderStatusOf(credited.id)).toBe("credited");
      expect(await coinsOf()).toBe(100);
    });

    it("matches nothing for an unknown provider payment id", async () => {
      await createAttached("900000009");
      const result = await settle("123123123");
      expect(result).toEqual({ status: "not-found" });
      expect(await coinsOf()).toBe(0);
    });

    it("matches a payment by exact id only", async () => {
      await createAttached("900000127");
      expect((await settle("90000012")).status).toBe("not-found");
      expect((await settle("9000001270")).status).toBe("not-found");
      expect((await settle(" 900000127")).status).toBe("not-found");
      expect(await coinsOf()).toBe(0);
    });
  });

  describe("balance cap", () => {
    it("parks a payment at the balance cap and credits once there is room", async () => {
      const paymentId = "900000008";
      const order = await createAttached(paymentId);
      await setCoins(STORE_LIMITS.maxBalance - 50);
      const parked = await settle(paymentId);
      expect(parked.status).toBe("balance-limit");
      expect(await orderStatusOf(order.id)).toBe("paid");
      expect(await coinsOf()).toBe(STORE_LIMITS.maxBalance - 50);
      expect(await auditCountOf("pix-credit-parked")).toBe(1);
      const stillParked = await settle(paymentId);
      expect(stillParked.status).toBe("balance-limit");
      expect(await auditCountOf("pix-credit-parked")).toBe(1);
      await setCoins(0);
      const retried = await settle(paymentId);
      expect(retried.status).toBe("credited");
      expect(await coinsOf()).toBe(100);
      const [audit] = await auditDetailsOf("pix-coin-credit");
      expect(audit).toMatchObject({ previousStatus: "paid" });
    });

    it("credits right up to the cap", async () => {
      const paymentId = "900000128";
      await createAttached(paymentId);
      await setCoins(STORE_LIMITS.maxBalance - 100);
      expect((await settle(paymentId)).status).toBe("credited");
      expect(await coinsOf()).toBe(STORE_LIMITS.maxBalance);
    });

    it("never cancels or expires a parked (paid) order", async () => {
      const paymentId = "900000129";
      const order = await createAttached(
        paymentId,
        new Date(Date.now() - 60_000),
      );
      await setCoins(STORE_LIMITS.maxBalance);
      await settle(paymentId);
      expect(await orderStatusOf(order.id)).toBe("paid");
      expect(await store.expireStale(new Date())).toEqual([]);
      expect(
        await store.cancelOrder({ orderId: order.id, accountId, characterId }),
      ).toBe("not-found");
      expect(await store.markProviderCancelled(paymentId)).toBeNull();
      expect(await orderStatusOf(order.id)).toBe("paid");
    });
  });

  describe("refunds", () => {
    it("refunds once under a race and claws back at most the balance", async () => {
      const paymentId = "900000007";
      const order = await createAttached(paymentId);
      await settle(paymentId);
      await setCoins(30);
      const results = await Promise.all(
        Array.from({ length: 4 }, () => refund(paymentId)),
      );
      const refunded = results.filter((entry) => entry.status === "refunded");
      expect(refunded).toHaveLength(1);
      expect(refunded[0]).toMatchObject({ coinsDebited: 30, balance: 0 });
      expect(
        results.filter((entry) => entry.status === "already-refunded"),
      ).toHaveLength(3);
      expect(await coinsOf()).toBe(0);
      expect(await orderStatusOf(order.id)).toBe("refunded");
      const audit = await auditDetailsOf("pix-refund");
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        orderId: order.id,
        accountId,
        providerPaymentId: paymentId,
        previousStatus: "credited",
        coins: 100,
        coinsDebited: 30,
        shortfall: 70,
        balanceBefore: 30,
        balanceAfter: 0,
      });
      expect(await ledgerRowsOf()).toEqual([
        expect.objectContaining({ entry_type: "grant", amount: 100 }),
        {
          entry_type: "refund",
          amount: -30,
          balance_after: 0,
          request_key: `pix-refund:${order.id}`,
        },
      ]);
    });

    it("claws back the full amount when the balance covers it", async () => {
      const paymentId = "900000130";
      await createAttached(paymentId);
      await settle(paymentId);
      await setCoins(250);
      const result = await refund(paymentId);
      expect(result).toMatchObject({
        status: "refunded",
        coinsDebited: 100,
        balance: 150,
      });
      expect(await coinsOf()).toBe(150);
    });

    it("never re-credits a refunded order when the approved webhook is replayed", async () => {
      const paymentId = "900000131";
      const order = await createAttached(paymentId);
      await settle(paymentId);
      await refund(paymentId);
      expect(await coinsOf()).toBe(0);
      const replay = await settle(paymentId);
      expect(replay).toEqual({ status: "already-settled", orderId: order.id });
      expect(await coinsOf()).toBe(0);
      expect(await orderStatusOf(order.id)).toBe("refunded");
    });

    it("marks a never-credited order refunded without touching the balance or ledger", async () => {
      const paymentId = "900000132";
      await setCoins(40);
      const order = await createAttached(paymentId);
      const result = await refund(paymentId);
      expect(result).toMatchObject({ status: "refunded", coinsDebited: 0 });
      expect(await coinsOf()).toBe(40);
      expect(await ledgerRowsOf()).toEqual([]);
      expect(await orderStatusOf(order.id)).toBe("refunded");
      const [audit] = await auditDetailsOf("pix-refund");
      expect(audit).toMatchObject({
        previousStatus: "pending",
        coinsDebited: 0,
        shortfall: 0,
      });
    });

    it("marks a parked (paid) order refunded without touching the balance", async () => {
      const paymentId = "900000133";
      await createAttached(paymentId);
      await setCoins(STORE_LIMITS.maxBalance);
      await settle(paymentId);
      const result = await refund(paymentId);
      expect(result).toMatchObject({ status: "refunded", coinsDebited: 0 });
      expect(await coinsOf()).toBe(STORE_LIMITS.maxBalance);
    });

    it("refuses a refund whose external reference names another order", async () => {
      const paymentId = "900000134";
      const order = await createAttached(paymentId);
      await settle(paymentId);
      const result = await refund(paymentId, {
        externalReference: randomUUID(),
      });
      expect(result).toEqual({
        status: "refused",
        reason: "reference-mismatch",
        orderId: order.id,
      });
      expect(await coinsOf()).toBe(100);
      expect(await orderStatusOf(order.id)).toBe("credited");
    });

    it("matches nothing for an unknown payment id", async () => {
      expect(await refund("555")).toEqual({ status: "not-found" });
    });

    it("ends consistently when a refund races the credit", async () => {
      const paymentId = "900000135";
      const order = await createAttached(paymentId);
      await Promise.all([
        settle(paymentId),
        refund(paymentId),
        settle(paymentId),
        refund(paymentId),
      ]);
      const status = await orderStatusOf(order.id);
      expect(status).toBe("refunded");
      expect(await coinsOf()).toBe(0);
      const ledger = await ledgerRowsOf();
      expect(ledger.length === 0 || ledger.length === 2).toBe(true);
      if (ledger.length === 2) {
        expect(ledger[0]).toMatchObject({ entry_type: "grant", amount: 100 });
        expect(ledger[1]).toMatchObject({
          entry_type: "refund",
          amount: -100,
          balance_after: 0,
        });
      }
    });

    it("does not let a refund clawback push a concurrent store purchase below zero", async () => {
      const paymentId = "900000136";
      await createAttached(paymentId);
      await settle(paymentId);
      const spend = pool.query(
        `UPDATE accounts SET mantus_coins = mantus_coins - 60
         WHERE id = $1 AND mantus_coins >= 60`,
        [accountId],
      );
      await Promise.all([spend, refund(paymentId)]);
      expect(await coinsOf()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("expiry and reconciliation", () => {
    it("expires only pending orders past their deadline", async () => {
      const stale = await createAttached(
        "900000012",
        new Date(Date.now() - 60_000),
      );
      const other = await insertAccount();
      const fresh = await createAttached("900000137", undefined, other);
      const expired = await store.expireStale(new Date());
      expect(expired.map((entry) => entry.id)).toEqual([stale.id]);
      expect(await orderStatusOf(stale.id)).toBe("expired");
      expect(await orderStatusOf(fresh.id)).toBe("pending");
      expect(await auditCountOf("pix-order-expired")).toBe(1);
      expect(await store.expireStale(new Date())).toEqual([]);
    });

    it("expires each order once under concurrent sweeps", async () => {
      const stale = await createAttached(
        "900000138",
        new Date(Date.now() - 60_000),
      );
      const results = await Promise.all(
        Array.from({ length: 4 }, () => store.expireStale(new Date())),
      );
      const expiredIds = results.flat().map((entry) => entry.id);
      expect(expiredIds).toEqual([stale.id]);
      expect(await auditCountOf("pix-order-expired")).toBe(1);
    });

    it("lists paid and stale pending orders for reconciliation, nothing terminal", async () => {
      const parkedPayment = "900000013";
      const parked = await createAttached(parkedPayment);
      await setCoins(STORE_LIMITS.maxBalance - 50);
      await settle(parkedPayment);
      await setCoins(0);

      const accounts = await Promise.all(
        Array.from({ length: 5 }, () => insertAccount()),
      );
      const stalePending = await createAttached(
        "900000139",
        undefined,
        accounts[0],
      );
      const credited = await createAttached(
        "900000140",
        undefined,
        accounts[1],
      );
      await settle("900000140");
      const cancelled = await createAttached(
        "900000141",
        undefined,
        accounts[2],
      );
      await store.cancelOrder({
        orderId: cancelled.id,
        accountId: accounts[2]!,
        characterId: null,
      });
      const refused = await createAttached("900000142", undefined, accounts[3]);
      await settle("900000142", { amountCentavos: 1 });
      const stranded = await store.createOrder({
        orderId: randomUUID(),
        accountId: accounts[4]!,
        characterId: null,
        packageId: "coins-100",
        coins: 100,
        amountCentavos: 1_000,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        maxPerHour: 10,
      });

      const listed = (
        await store.claimForReconciliation(new Date(Date.now() + 1_000), 50)
      ).map((entry) => entry.id);
      expect(listed).toContain(parked.id);
      expect(listed).toContain(stalePending.id);
      expect(listed).not.toContain(credited.id);
      expect(listed).not.toContain(cancelled.id);
      expect(listed).not.toContain(refused.id);
      expect(listed).not.toContain(
        stranded.status === "created" ? stranded.order.id : "",
      );

      const tooYoung = (
        await store.claimForReconciliation(new Date(Date.now() - 60_000), 50)
      ).map((entry) => entry.id);
      expect(tooYoung).toContain(parked.id);
      expect(tooYoung).not.toContain(stalePending.id);
    });

    it("bounds the reconciliation batch size", async () => {
      const accounts = await Promise.all(
        Array.from({ length: 3 }, () => insertAccount()),
      );
      for (const [index, account] of accounts.entries()) {
        await createAttached(`90000015${index}`, undefined, account);
      }
      expect(
        await store.claimForReconciliation(new Date(Date.now() + 1_000), 0),
      ).toHaveLength(1);
      expect(
        await store.claimForReconciliation(new Date(Date.now() + 1_000), -5),
      ).toHaveLength(1);
      expect(
        await store.claimForReconciliation(new Date(Date.now() + 1_000), 2.9),
      ).toHaveLength(2);
      expect(
        await store.claimForReconciliation(
          new Date(Date.now() + 1_000),
          10_000,
        ),
      ).toHaveLength(3);
    });
  });

  describe("hourly order cap", () => {
    it("refuses the eleventh order of an hour, counting cancelled ones, per account", async () => {
      for (let index = 0; index < 10; index += 1) {
        const order = await createStranded();
        expect(
          await store.cancelOrder({
            orderId: order.id,
            accountId,
            characterId,
          }),
        ).toBe("cancelled");
      }
      const refused = await store.createOrder({
        orderId: randomUUID(),
        accountId,
        characterId,
        packageId: "coins-100",
        coins: 100,
        amountCentavos: 1_000,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        maxPerHour: 10,
      });
      expect(refused).toEqual({ status: "too-many-orders", recentCount: 10 });
      expect(await store.openOrderFor(accountId)).toBeNull();
      const other = await insertAccount();
      expect((await createStranded(other)).status).toBe("pending");
    });

    it("never lets a burst slip past the cap", async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, async () => {
          const created = await store.createOrder({
            orderId: randomUUID(),
            accountId,
            characterId,
            packageId: "coins-100",
            coins: 100,
            amountCentavos: 1_000,
            expiresAt: new Date(Date.now() + 60 * 60_000),
            maxPerHour: 3,
          });
          if (created.status === "created") {
            await store.cancelOrder({
              orderId: created.order.id,
              accountId,
              characterId,
            });
          }
          return created.status;
        }),
      );
      const rows = await pool.query(
        "SELECT count(*) FROM pix_orders WHERE account_id = $1",
        [accountId],
      );
      // Concurrent creates also collide on the one-open-order rule, so the
      // invariant is the row count, not how each loser was refused.
      expect(Number(rows.rows[0].count)).toBeLessThanOrEqual(3);
      expect(
        results.filter((status) => status === "created").length,
      ).toBeLessThanOrEqual(3);
      for (const status of results) {
        expect(["created", "pending-order-exists", "too-many-orders"]).toContain(
          status,
        );
      }
    });

    it("stops counting an order after an hour", async () => {
      const old = await createStranded();
      await pool.query(
        "UPDATE pix_orders SET created_at = now() - interval '61 minutes', status = 'expired' WHERE id = $1",
        [old.id],
      );
      const created = await store.createOrder({
        orderId: randomUUID(),
        accountId,
        characterId,
        packageId: "coins-100",
        coins: 100,
        amountCentavos: 1_000,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        maxPerHour: 1,
      });
      expect(created.status).toBe("created");
    });
  });

  describe("payment adoption", () => {
    it("adopts an approved payment onto a stranded pending order and the normal settle credits it", async () => {
      const stranded = await createStranded();
      const paymentId = "900000300";
      expect(
        await settle(paymentId, { externalReference: stranded.id }),
      ).toEqual({ status: "not-found" });
      const adopted = await store.adoptPayment({
        orderId: stranded.id,
        providerPaymentId: paymentId,
      });
      expect(adopted?.providerPaymentId).toBe(paymentId);
      expect(await auditCountOf("pix-payment-adopted")).toBe(1);
      const result = await settle(paymentId, {
        externalReference: stranded.id,
      });
      expect(result).toMatchObject({ status: "credited", coins: 100 });
      expect(await coinsOf()).toBe(100);
    });

    it("adopts onto an expired or cancelled stranded order too (the money is real)", async () => {
      const expired = await createStranded(
        accountId,
        new Date(Date.now() - 60_000),
      );
      await store.expireStale(new Date());
      expect(
        (
          await store.adoptPayment({
            orderId: expired.id,
            providerPaymentId: "900000301",
          })
        )?.status,
      ).toBe("expired");
      expect((await settle("900000301")).status).toBe("credited");
      const cancelled = await createStranded();
      await store.cancelOrder({
        orderId: cancelled.id,
        accountId,
        characterId,
      });
      expect(
        (
          await store.adoptPayment({
            orderId: cancelled.id,
            providerPaymentId: "900000302",
          })
        )?.status,
      ).toBe("cancelled");
      expect((await settle("900000302")).status).toBe("credited");
      expect(await coinsOf()).toBe(200);
    });

    it("refuses to adopt onto an order that already carries a charge, is settled, or does not exist", async () => {
      const charged = await createAttached("900000303");
      expect(
        await store.adoptPayment({
          orderId: charged.id,
          providerPaymentId: "900000304",
        }),
      ).toBeNull();
      expect(
        await store.adoptPayment({
          orderId: charged.id,
          providerPaymentId: "900000303",
        }),
      ).toBeNull();
      expect(
        await store.adoptPayment({
          orderId: randomUUID(),
          providerPaymentId: "900000305",
        }),
      ).toBeNull();
      expect(
        await store.adoptPayment({
          orderId: "not-a-uuid",
          providerPaymentId: "900000305",
        }),
      ).toBeNull();
      expect(await auditCountOf("pix-payment-adopted")).toBe(0);
    });

    it("refuses to adopt a payment id another order already owns", async () => {
      const other = await insertAccount();
      await createAttached("900000306", undefined, other);
      const stranded = await createStranded();
      await expect(
        store.adoptPayment({
          orderId: stranded.id,
          providerPaymentId: "900000306",
        }),
      ).rejects.toThrow(/unique|duplicate/i);
      expect(
        (await store.orderById(stranded.id))?.providerPaymentId,
      ).toBeNull();
    });

    it("lets the late attachCharge see the settled order instead of failing it", async () => {
      const stranded = await createStranded();
      const paymentId = "900000307";
      await store.adoptPayment({
        orderId: stranded.id,
        providerPaymentId: paymentId,
      });
      await settle(paymentId);
      const late = await store.attachCharge({
        orderId: stranded.id,
        providerPaymentId: paymentId,
        brcode: "late-brcode",
      });
      expect(late?.status).toBe("credited");
      expect(late?.brcode).toBe("late-brcode");
      const other = await store.attachCharge({
        orderId: stranded.id,
        providerPaymentId: "900000308",
        brcode: "x",
      });
      expect(other).toBeNull();
      expect(await coinsOf()).toBe(100);
    });

    it("adoption racing the attach converges on one payment id and one credit", async () => {
      const stranded = await createStranded();
      const paymentId = "900000309";
      await Promise.all([
        store.adoptPayment({
          orderId: stranded.id,
          providerPaymentId: paymentId,
        }),
        store.attachCharge({
          orderId: stranded.id,
          providerPaymentId: paymentId,
          brcode: "b",
        }),
        settle(paymentId),
        settle(paymentId),
      ]);
      // Whether a racing settle or this final one credits, there is one credit.
      expect(["credited", "already-settled"]).toContain(
        (await settle(paymentId)).status,
      );
      expect((await settle(paymentId)).status).toBe("already-settled");
      expect(await coinsOf()).toBe(100);
      expect(await ledgerRowsOf()).toHaveLength(1);
      expect((await store.orderById(stranded.id))?.providerPaymentId).toBe(
        paymentId,
      );
    });
  });

  describe("reconciliation fairness", () => {
    it("claims never-checked orders first, then the least recently checked, stamping each claim", async () => {
      const accounts = await Promise.all(
        Array.from({ length: 3 }, () => insertAccount()),
      );
      const orders: PixOrderRecord[] = [];
      for (const [index, account] of accounts.entries()) {
        orders.push(
          await createAttached(`90000031${index}`, undefined, account),
        );
        await pool.query(
          "UPDATE pix_orders SET created_at = now() - interval '10 minutes' + ($2::int * interval '1 second') WHERE id = $1",
          [orders[index]!.id, index],
        );
      }
      const first = await store.claimForReconciliation(new Date(), 2);
      expect(first.map((entry) => entry.id)).toEqual([
        orders[0]!.id,
        orders[1]!.id,
      ]);
      const second = await store.claimForReconciliation(new Date(), 2);
      expect(second.map((entry) => entry.id)).toEqual([
        orders[0]!.id,
        orders[2]!.id,
      ]);
      // o1 was checked longest ago; o0 and o2 share a stamp, so the older wins.
      const third = await store.claimForReconciliation(new Date(), 2);
      expect(third.map((entry) => entry.id)).toEqual([
        orders[0]!.id,
        orders[1]!.id,
      ]);
      const stamped = await pool.query<{ n: string }>(
        "SELECT count(*) AS n FROM pix_orders WHERE last_checked_at IS NOT NULL",
      );
      expect(Number(stamped.rows[0]?.n)).toBe(3);
    });

    it("hands each order to only one of two concurrent sweeps", async () => {
      const accounts = await Promise.all(
        Array.from({ length: 4 }, () => insertAccount()),
      );
      for (const [index, account] of accounts.entries()) {
        const order = await createAttached(
          `90000032${index}`,
          undefined,
          account,
        );
        await pool.query(
          "UPDATE pix_orders SET created_at = now() - interval '10 minutes' WHERE id = $1",
          [order.id],
        );
      }
      const [a, b] = await Promise.all([
        store.claimForReconciliation(new Date(), 4),
        store.claimForReconciliation(new Date(), 4),
      ]);
      const ids = [...a, ...b].map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(4);
    });
  });

  describe("partial refunds", () => {
    it("claws back the proportional share once per reported level, then the remainder on the full refund", async () => {
      const paymentId = "900000330";
      const order = await createAttached(paymentId);
      await settle(paymentId);
      expect(await coinsOf()).toBe(100);

      const first = await refund(paymentId, { refundedCentavos: 300 });
      expect(first).toMatchObject({
        status: "refunded",
        coinsDebited: 30,
        balance: 70,
        complete: false,
      });
      expect(await orderStatusOf(order.id)).toBe("credited");
      expect((await store.orderById(order.id))?.refundedCentavos).toBe(300);

      expect(await refund(paymentId, { refundedCentavos: 300 })).toEqual({
        status: "already-refunded",
        orderId: order.id,
      });
      expect(await refund(paymentId, { refundedCentavos: 200 })).toEqual({
        status: "already-refunded",
        orderId: order.id,
      });
      expect(await coinsOf()).toBe(70);

      const second = await refund(paymentId, { refundedCentavos: 505 });
      expect(second).toMatchObject({
        status: "refunded",
        coinsDebited: 21,
        balance: 49,
        complete: false,
      });

      const full = await refund(paymentId, { refundedCentavos: null });
      expect(full).toMatchObject({
        status: "refunded",
        coinsDebited: 49,
        balance: 0,
        complete: true,
      });
      expect(await orderStatusOf(order.id)).toBe("refunded");
      expect(await coinsOf()).toBe(0);
      const ledger = await ledgerRowsOf();
      expect(
        ledger
          .filter((row) => row.entry_type === "refund")
          .map((row) => row.amount),
      ).toEqual([-30, -21, -49]);
      expect(await auditCountOf("pix-refund")).toBe(3);
      expect((await settle(paymentId)).status).toBe("already-settled");
    });

    it("treats a reported amount at or above the order amount as a full refund", async () => {
      const paymentId = "900000331";
      const order = await createAttached(paymentId);
      await settle(paymentId);
      const result = await refund(paymentId, { refundedCentavos: 5_000 });
      expect(result).toMatchObject({
        status: "refunded",
        coinsDebited: 100,
        complete: true,
      });
      expect(await orderStatusOf(order.id)).toBe("refunded");
      expect((await store.orderById(order.id))?.refundedCentavos).toBe(1_000);
    });

    it("applies partial refunds exactly once under a race", async () => {
      const paymentId = "900000332";
      await createAttached(paymentId);
      await settle(paymentId);
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          refund(paymentId, { refundedCentavos: 400 }),
        ),
      );
      expect(
        results.filter((entry) => entry.status === "refunded"),
      ).toHaveLength(1);
      expect(await coinsOf()).toBe(60);
    });

    it("rejects a negative or non-integer refunded amount before touching the database", async () => {
      const paymentId = "900000333";
      await createAttached(paymentId);
      await settle(paymentId);
      for (const refundedCentavos of [-1, 10.5, Number.NaN]) {
        await expect(refund(paymentId, { refundedCentavos })).rejects.toThrow(
          "invalid refunded amount",
        );
      }
      expect(await coinsOf()).toBe(100);
    });
  });

  describe("operator resolution", () => {
    const OPERATOR_ID = "00000000-0000-4000-8000-0000000000ee";

    it("force-credits a refused order once, under the settle ledger key, audited with the operator", async () => {
      const paymentId = "900000340";
      const order = await createAttached(paymentId);
      await settle(paymentId, { amountCentavos: 1 });
      expect(await orderStatusOf(order.id)).toBe("refused");
      const result = await store.operatorCredit({
        orderId: order.id,
        operatorCharacterId: characterId,
      });
      expect(result).toMatchObject({
        status: "credited",
        coins: 100,
        balance: 100,
      });
      expect(await coinsOf()).toBe(100);
      expect(await orderStatusOf(order.id)).toBe("credited");
      expect(await ledgerRowsOf()).toEqual([
        expect.objectContaining({
          entry_type: "grant",
          amount: 100,
          request_key: `pix-credit:${order.id}`,
        }),
      ]);
      const [audit] = await auditDetailsOf("pix-operator-credit");
      expect(audit).toMatchObject({
        orderId: order.id,
        operatorCharacterId: characterId,
        previousStatus: "refused",
      });
      expect(
        await store.operatorCredit({
          orderId: order.id,
          operatorCharacterId: characterId,
        }),
      ).toEqual({
        status: "not-refused",
        orderId: order.id,
        orderStatus: "credited",
      });
      expect((await settle(paymentId)).status).toBe("already-settled");
      expect(await coinsOf()).toBe(100);
    });

    it("refuses to force-credit any order that is not refused", async () => {
      const pending = await createAttached("900000341");
      expect(
        (
          await store.operatorCredit({
            orderId: pending.id,
            operatorCharacterId: characterId,
          })
        ).status,
      ).toBe("not-refused");
      expect(
        await store.operatorCredit({
          orderId: randomUUID(),
          operatorCharacterId: characterId,
        }),
      ).toEqual({ status: "not-found" });
      expect(
        await store.operatorCredit({
          orderId: "junk",
          operatorCharacterId: characterId,
        }),
      ).toEqual({ status: "not-found" });
      expect(await coinsOf()).toBe(0);
    });

    it("still respects the balance cap when an operator credits", async () => {
      const paymentId = "900000342";
      const order = await createAttached(paymentId);
      await settle(paymentId, { amountCentavos: 1 });
      await setCoins(STORE_LIMITS.maxBalance);
      expect(
        await store.operatorCredit({
          orderId: order.id,
          operatorCharacterId: characterId,
        }),
      ).toEqual({
        status: "balance-limit",
        orderId: order.id,
      });
      expect(await orderStatusOf(order.id)).toBe("paid");
      expect(await coinsOf()).toBe(STORE_LIMITS.maxBalance);
    });

    it("credits an operator override once under a race", async () => {
      const paymentId = "900000343";
      const order = await createAttached(paymentId);
      await settle(paymentId, { amountCentavos: 1 });
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          store.operatorCredit({
            orderId: order.id,
            operatorCharacterId: OPERATOR_ID,
          }),
        ),
      );
      expect(
        results.filter((entry) => entry.status === "credited"),
      ).toHaveLength(1);
      expect(await coinsOf()).toBe(100);
    });

    it("audits an operator refund under its own event with the operator id", async () => {
      const paymentId = "900000344";
      const order = await createAttached(paymentId);
      await settle(paymentId);
      const result = await refund(paymentId, {
        operatorCharacterId: characterId,
      });
      expect(result).toMatchObject({
        status: "refunded",
        coinsDebited: 100,
        complete: true,
      });
      expect(await auditCountOf("pix-refund")).toBe(0);
      const [audit] = await auditDetailsOf("pix-operator-refund");
      expect(audit).toMatchObject({
        orderId: order.id,
        operatorCharacterId: characterId,
        coinsDebited: 100,
      });
    });

    it("looks orders up by id and by character name, newest first and bounded", async () => {
      const first = await createAttached("900000345");
      await store.cancelOrder({ orderId: first.id, accountId, characterId });
      const second = await createAttached("900000346");
      expect((await store.orderById(first.id))?.status).toBe("cancelled");
      expect(await store.orderById(randomUUID())).toBeNull();
      expect(await store.orderById("nope")).toBeNull();
      expect(await store.accountIdByCharacterName("pix hero")).toBe(accountId);
      expect(await store.accountIdByCharacterName("Pix Hero")).toBeNull();
      expect(await store.accountIdByCharacterName("nobody")).toBeNull();
      const recent = await store.recentOrdersForAccount(accountId, 1);
      expect(recent.map((entry) => entry.id)).toEqual([second.id]);
      expect(await store.recentOrdersForAccount(accountId, 999)).toHaveLength(
        2,
      );
      const other = await insertAccount();
      expect(await store.recentOrdersForAccount(other, 5)).toEqual([]);
      await store.recordOperatorInspect({
        operatorCharacterId: characterId,
        subject: "pix hero",
      });
      const [audit] = await auditDetailsOf("pix-operator-inspect");
      expect(audit).toMatchObject({
        operatorCharacterId: characterId,
        subject: "pix hero",
      });
    });
  });
});
