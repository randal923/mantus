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

const setCoins = async (amount: number): Promise<void> => {
  await pool.query("UPDATE accounts SET mantus_coins = $2 WHERE id = $1", [
    accountId,
    amount,
  ]);
};

const coinsOf = async (): Promise<number> => {
  const result = await pool.query<{ mantus_coins: string }>(
    "SELECT mantus_coins FROM accounts WHERE id = $1",
    [accountId],
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

const createAttached = async (
  paymentId: string,
  expiresAt = new Date(Date.now() + 60 * 60_000),
): Promise<PixOrderRecord> => {
  const created = await store.createOrder({
    orderId: randomUUID(),
    accountId,
    characterId,
    packageId: "coins-100",
    coins: 100,
    amountCentavos: 1_000,
    expiresAt,
  });
  expect(created.status).toBe("created");
  const attached = await store.attachCharge({
    orderId: created.order.id,
    providerPaymentId: paymentId,
    brcode: "00020126pixpayload6304ABCD",
  });
  expect(attached).not.toBeNull();
  return attached!;
};

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
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (supabase_user_id, language, mantus_coins)
       VALUES ($1, 'en', 0)
       RETURNING id`,
      [`pix-${randomUUID()}`],
    );
    accountId = account.rows[0]!.id;
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
        }),
      ),
    );
    const created = results.filter((entry) => entry.status === "created");
    const refused = results.filter(
      (entry) => entry.status === "pending-order-exists",
    );
    expect(created).toHaveLength(1);
    expect(refused).toHaveLength(4);
    const rows = await pool.query(
      "SELECT count(*) FROM pix_orders WHERE status = 'pending'",
    );
    expect(Number(rows.rows[0].count)).toBe(1);
  });

  it("credits exactly once when duplicated webhooks race", async () => {
    const paymentId = "900000001";
    const order = await createAttached(paymentId);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        store.settleApproved({
          providerPaymentId: paymentId,
          amountCentavos: 1_000,
          snapshot: { id: paymentId, status: "approved" },
        }),
      ),
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
    const first = await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1_000,
      snapshot: {},
    });
    expect(first.status).toBe("credited");
    const replay = await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1_000,
      snapshot: {},
    });
    expect(replay.status).toBe("already-settled");
    expect(await coinsOf()).toBe(100);
  });

  it("never credits a payment whose amount differs from the order", async () => {
    const paymentId = "900000003";
    const order = await createAttached(paymentId);
    const result = await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1,
      snapshot: { id: paymentId },
    });
    expect(result.status).toBe("amount-mismatch");
    expect(await coinsOf()).toBe(0);
    expect(await orderStatusOf(order.id)).toBe("pending");
    const ledger = await pool.query("SELECT count(*) FROM mantus_coin_ledger");
    expect(Number(ledger.rows[0].count)).toBe(0);
  });

  it("still credits an order the player cancelled in the pay race", async () => {
    const paymentId = "900000004";
    const order = await createAttached(paymentId);
    expect(
      await store.cancelOrder({ orderId: order.id, accountId, characterId }),
    ).toBe("cancelled");
    const result = await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1_000,
      snapshot: {},
    });
    expect(result.status).toBe("credited");
    expect(await coinsOf()).toBe(100);
  });

  it("still credits an order that expired before the webhook landed", async () => {
    const paymentId = "900000005";
    const order = await createAttached(
      paymentId,
      new Date(Date.now() - 60_000),
    );
    const expired = await store.expireStale(new Date());
    expect(expired.map((entry) => entry.id)).toContain(order.id);
    const result = await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1_000,
      snapshot: {},
    });
    expect(result.status).toBe("credited");
    expect(await coinsOf()).toBe(100);
  });

  it("refuses to cancel anything but a pending order", async () => {
    const paymentId = "900000006";
    const order = await createAttached(paymentId);
    await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1_000,
      snapshot: {},
    });
    expect(
      await store.cancelOrder({ orderId: order.id, accountId, characterId }),
    ).toBe("not-found");
    expect(await orderStatusOf(order.id)).toBe("credited");
    expect(await coinsOf()).toBe(100);
  });

  it("refunds once under a race and claws back at most the balance", async () => {
    const paymentId = "900000007";
    const order = await createAttached(paymentId);
    await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1_000,
      snapshot: {},
    });
    await setCoins(30);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        store.markRefunded({
          providerPaymentId: paymentId,
          snapshot: { id: paymentId, status: "refunded" },
        }),
      ),
    );
    const refunded = results.filter((entry) => entry.status === "refunded");
    expect(refunded).toHaveLength(1);
    expect(refunded[0]).toMatchObject({ coinsDebited: 30, balance: 0 });
    expect(
      results.filter((entry) => entry.status === "already-refunded"),
    ).toHaveLength(3);
    expect(await coinsOf()).toBe(0);
    expect(await orderStatusOf(order.id)).toBe("refunded");
    const audit = await pool.query<{ details: { shortfall: number } }>(
      "SELECT details FROM audit_log WHERE event_type = 'pix-refund'",
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]!.details.shortfall).toBe(70);
  });

  it("parks a payment at the balance cap and credits once there is room", async () => {
    const paymentId = "900000008";
    const order = await createAttached(paymentId);
    await setCoins(STORE_LIMITS.maxBalance - 50);
    const parked = await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1_000,
      snapshot: {},
    });
    expect(parked.status).toBe("balance-limit");
    expect(await orderStatusOf(order.id)).toBe("paid");
    expect(await coinsOf()).toBe(STORE_LIMITS.maxBalance - 50);
    await setCoins(0);
    const retried = await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1_000,
      snapshot: {},
    });
    expect(retried.status).toBe("credited");
    expect(await coinsOf()).toBe(100);
  });

  it("matches nothing for an unknown provider payment id", async () => {
    await createAttached("900000009");
    const result = await store.settleApproved({
      providerPaymentId: "123123123",
      amountCentavos: 1_000,
      snapshot: {},
    });
    expect(result.status).toBe("not-found");
    expect(await coinsOf()).toBe(0);
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

  it("expires only pending orders past their deadline", async () => {
    const stale = await createAttached(
      "900000012",
      new Date(Date.now() - 60_000),
    );
    const expired = await store.expireStale(new Date());
    expect(expired.map((entry) => entry.id)).toEqual([stale.id]);
    expect(await orderStatusOf(stale.id)).toBe("expired");
    expect(await auditCountOf("pix-order-expired")).toBe(1);
    expect(await store.expireStale(new Date())).toEqual([]);
  });

  it("lists paid and stale pending orders for reconciliation", async () => {
    const paymentId = "900000013";
    const order = await createAttached(paymentId);
    await setCoins(STORE_LIMITS.maxBalance - 50);
    await store.settleApproved({
      providerPaymentId: paymentId,
      amountCentavos: 1_000,
      snapshot: {},
    });
    const listed = await store.openForReconciliation(new Date(), 50);
    expect(listed.map((entry) => entry.id)).toContain(order.id);
  });
});
