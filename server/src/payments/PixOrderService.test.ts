import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORE_LIMITS, type ServerMessage } from "@tibia/protocol";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import {
  PIX_COIN_PACKAGES,
  PIX_COIN_PACKAGES_BY_ID,
} from "./PIX_COIN_PACKAGES";
import type { PixOrderRecord, PixOrderStore } from "./PixOrderStore";
import {
  MAX_ORDERS_PER_ACCOUNT_PER_HOUR,
  PixOrderService,
} from "./PixOrderService";
import type { PixPaymentStatus, PixProvider } from "./PixProvider";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const CHARACTER_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_ACCOUNT_ID = "00000000-0000-4000-8000-000000000003";
const ORDER_ID = "00000000-0000-4000-8000-00000000000a";
const PAYMENT_ID = "987654321";

function makeOrder(overrides: Partial<PixOrderRecord> = {}): PixOrderRecord {
  return {
    id: ORDER_ID,
    accountId: ACCOUNT_ID,
    characterId: CHARACTER_ID,
    packageId: "coins-100",
    coins: 100,
    amountCentavos: 1_000,
    refundedCentavos: 0,
    providerPaymentId: PAYMENT_ID,
    brcode: "00020126pixpayload6304ABCD",
    status: "pending",
    createdAt: new Date("2026-08-30T12:00:00.000Z"),
    expiresAt: new Date(Date.now() + 60 * 60_000),
    ...overrides,
  };
}

function makePayment(
  overrides: Partial<PixPaymentStatus> = {},
): PixPaymentStatus {
  return {
    status: "pending",
    amountCentavos: 1_000,
    refundedCentavos: null,
    currency: "BRL",
    externalReference: ORDER_ID,
    snapshot: {},
    ...overrides,
  };
}

type TestSession = Session & { sent: ServerMessage[] };

function makeSession(
  coins = 50,
  accountId: string | null = ACCOUNT_ID,
): TestSession {
  const sent: ServerMessage[] = [];
  return {
    sent,
    playerId: CHARACTER_ID,
    account:
      accountId === null
        ? null
        : { id: accountId, email: "buyer@example.com", mantusCoins: coins },
    send: (message: ServerMessage) => {
      sent.push(message);
    },
  } as unknown as TestSession;
}

function makeRegistry(
  sessions: Record<string, Session | undefined>,
): SessionRegistry {
  return {
    sessionForAccount: (accountId: string) => sessions[accountId],
  } as unknown as SessionRegistry;
}

function registryOf(session: Session): SessionRegistry {
  return makeRegistry({ [ACCOUNT_ID]: session });
}

function makeStore(overrides: Partial<PixOrderStore> = {}): PixOrderStore {
  return {
    createOrder: vi.fn(
      async (input: {
        orderId: string;
        packageId: string;
        coins: number;
        amountCentavos: number;
      }) => ({
        status: "created" as const,
        order: makeOrder({
          id: input.orderId,
          packageId: input.packageId,
          coins: input.coins,
          amountCentavos: input.amountCentavos,
          providerPaymentId: null,
          brcode: null,
        }),
      }),
    ),
    attachCharge: vi.fn(async () => makeOrder()),
    adoptPayment: vi.fn(async () => null),
    openOrderFor: vi.fn(async () => null),
    orderById: vi.fn(async () => null),
    recentOrdersForAccount: vi.fn(async () => []),
    accountIdByCharacterName: vi.fn(async () => null),
    operatorCredit: vi.fn(async () => ({ status: "not-found" as const })),
    recordOperatorInspect: vi.fn(async () => {}),
    cancelOrder: vi.fn(async () => "cancelled" as const),
    settleApproved: vi.fn(async () => ({
      status: "not-found" as const,
    })),
    markRefunded: vi.fn(async () => ({ status: "not-found" as const })),
    markProviderCancelled: vi.fn(async () => null),
    expireStale: vi.fn(async () => []),
    claimForReconciliation: vi.fn(async () => []),
    ...overrides,
  };
}

function makeProvider(overrides: Partial<PixProvider> = {}): PixProvider {
  return {
    createCharge: vi.fn(async () => ({
      providerPaymentId: PAYMENT_ID,
      brcode: "00020126pixpayload6304ABCD",
    })),
    getPayment: vi.fn(async () => makePayment()),
    cancelPayment: vi.fn(async () => true),
    refundPayment: vi.fn(async () => true),
    ...overrides,
  };
}

function credited(coins = 100, balance = 150) {
  return {
    status: "credited" as const,
    orderId: ORDER_ID,
    accountId: ACCOUNT_ID,
    characterId: CHARACTER_ID,
    coins,
    balance,
  };
}

async function flush(service: PixOrderService): Promise<void> {
  await service.stop();
  service.applyResolvedOutcomes();
}

function logLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((call) => String(call[0]));
}

let logInfo: ReturnType<typeof vi.spyOn>;
let logWarn: ReturnType<typeof vi.spyOn>;
let logError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logInfo = vi.spyOn(console, "log").mockImplementation(() => {});
  logWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  logError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PixOrderService: intents", () => {
  it("pins price and coin amount from the server catalog, never the wire", async () => {
    const session = makeSession();
    const store = makeStore();
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-2500" },
      10_000,
    );
    await flush(service);
    const pack = PIX_COIN_PACKAGES_BY_ID.get("coins-2500")!;
    expect(store.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        characterId: CHARACTER_ID,
        packageId: pack.id,
        coins: pack.coins,
        amountCentavos: pack.amountCentavos,
        maxPerHour: MAX_ORDERS_PER_ACCOUNT_PER_HOUR,
      }),
    );
    expect(provider.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountCentavos: pack.amountCentavos }),
    );
  });

  it("refuses to open an order past the hourly cap without contacting the provider", async () => {
    const session = makeSession();
    const store = makeStore({
      createOrder: vi.fn(async () => ({
        status: "too-many-orders" as const,
        recentCount: 10,
      })),
    });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(provider.createCharge).not.toHaveBeenCalled();
    expect(session.sent).toEqual([
      { type: "coin-order-failed", reason: "rate-limited" },
    ]);
    expect(logLines(logWarn)).toContainEqual(
      `pix.create-refused-hourly-cap accountId=${ACCOUNT_ID} packageId=coins-100 recentOrders=10`,
    );
  });

  it("closes a charge whose brcode the wire could never carry", async () => {
    const session = makeSession();
    const store = makeStore();
    const provider = makeProvider({
      createCharge: vi.fn(async () => ({
        providerPaymentId: PAYMENT_ID,
        brcode: "x".repeat(2_049),
      })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(store.attachCharge).not.toHaveBeenCalled();
    expect(provider.cancelPayment).toHaveBeenCalledWith(PAYMENT_ID);
    expect(session.sent).toEqual([
      { type: "coin-order-failed", reason: "failed" },
    ]);
    expect(
      logLines(logError).some((line) =>
        line.startsWith("pix.charge-brcode-oversized"),
      ),
    ).toBe(true);
  });

  it("reports no open order when the payment settled before the charge was attached", async () => {
    const session = makeSession();
    const store = makeStore({
      attachCharge: vi.fn(async () => makeOrder({ status: "credited" })),
    });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(provider.cancelPayment).not.toHaveBeenCalled();
    expect(session.sent).toEqual([
      expect.objectContaining({ type: "coin-order-state", order: null }),
    ]);
    expect(
      logLines(logInfo).some((line) =>
        line.startsWith("pix.charge-attached-late"),
      ),
    ).toBe(true);
  });

  it("every catalog package charges exactly 10 coins per real", () => {
    expect(PIX_COIN_PACKAGES.length).toBeGreaterThan(0);
    for (const pack of PIX_COIN_PACKAGES) {
      expect(pack.amountCentavos).toBe(pack.coins * 10);
      expect(Number.isSafeInteger(pack.coins)).toBe(true);
      expect(pack.coins).toBeGreaterThan(0);
    }
    expect(new Set(PIX_COIN_PACKAGES.map((pack) => pack.id)).size).toBe(
      PIX_COIN_PACKAGES.length,
    );
  });

  it("refuses an unknown package id without touching the store or provider", async () => {
    const session = makeSession();
    const store = makeStore();
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    for (const packageId of [
      "coins-999999",
      "",
      "coins-100 ",
      "COINS-100",
      "__proto__",
    ]) {
      service.handle(session, { type: "coin-order-create", packageId }, 10_000);
    }
    await flush(service);
    expect(store.createOrder).not.toHaveBeenCalled();
    expect(provider.createCharge).not.toHaveBeenCalled();
    expect(session.sent).toContainEqual({
      type: "coin-order-failed",
      reason: "package-not-found",
    });
  });

  it("refuses every intent from a session without an account", async () => {
    const session = makeSession(0, null);
    const store = makeStore();
    const provider = makeProvider();
    const service = new PixOrderService(makeRegistry({}), store, provider);
    service.handle(session, { type: "coin-order-open" }, 10_000);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      12_000,
    );
    service.handle(
      session,
      { type: "coin-order-cancel", orderId: ORDER_ID },
      14_000,
    );
    await flush(service);
    expect(store.openOrderFor).not.toHaveBeenCalled();
    expect(store.createOrder).not.toHaveBeenCalled();
    expect(store.cancelOrder).not.toHaveBeenCalled();
    expect(provider.createCharge).not.toHaveBeenCalled();
    expect(session.sent).toEqual([
      { type: "coin-order-failed", reason: "unavailable" },
      { type: "coin-order-failed", reason: "unavailable" },
      { type: "coin-order-failed", reason: "unavailable" },
    ]);
  });

  it("enforces the per-account action cooldown across create and cancel", async () => {
    const session = makeSession();
    const store = makeStore();
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      1_000,
    );
    service.handle(
      session,
      { type: "coin-order-cancel", orderId: ORDER_ID },
      1_500,
    );
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      1_999,
    );
    await flush(service);
    expect(store.createOrder).toHaveBeenCalledTimes(1);
    expect(store.cancelOrder).not.toHaveBeenCalled();
    expect(
      session.sent.filter(
        (message) =>
          message.type === "coin-order-failed" &&
          message.reason === "rate-limited",
      ),
    ).toHaveLength(2);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      2_000,
    );
    await flush(service);
    expect(store.createOrder).toHaveBeenCalledTimes(2);
  });

  it("does not let one account's cooldown throttle another account", async () => {
    const a = makeSession();
    const b = makeSession(0, OTHER_ACCOUNT_ID);
    const store = makeStore();
    const service = new PixOrderService(
      makeRegistry({ [ACCOUNT_ID]: a, [OTHER_ACCOUNT_ID]: b }),
      store,
      makeProvider(),
    );
    service.handle(
      a,
      { type: "coin-order-create", packageId: "coins-100" },
      1_000,
    );
    service.handle(
      b,
      { type: "coin-order-create", packageId: "coins-100" },
      1_001,
    );
    await flush(service);
    expect(store.createOrder).toHaveBeenCalledTimes(2);
    expect(b.sent).not.toContainEqual({
      type: "coin-order-failed",
      reason: "rate-limited",
    });
  });

  it("leaves open (a read) outside the action cooldown", async () => {
    const session = makeSession();
    const store = makeStore();
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      1_000,
    );
    service.handle(session, { type: "coin-order-open" }, 1_100);
    await flush(service);
    expect(store.openOrderFor).toHaveBeenCalledTimes(1);
    expect(session.sent).not.toContainEqual({
      type: "coin-order-failed",
      reason: "rate-limited",
    });
  });

  it("refuses a second order while one is open and resends the open one", async () => {
    const session = makeSession();
    const existing = makeOrder();
    const store = makeStore({
      createOrder: vi.fn(async () => ({
        status: "pending-order-exists" as const,
        order: existing,
      })),
    });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(provider.createCharge).not.toHaveBeenCalled();
    expect(store.attachCharge).not.toHaveBeenCalled();
    expect(session.sent).toContainEqual({
      type: "coin-order-failed",
      reason: "pending-order-exists",
    });
    const state = session.sent.find(
      (message) => message.type === "coin-order-state",
    );
    expect(state).toMatchObject({ order: { id: ORDER_ID } });
  });

  it("resumes an interrupted checkout with the same order id (idempotency key)", async () => {
    const session = makeSession();
    const stranded = makeOrder({ providerPaymentId: null, brcode: null });
    const store = makeStore({
      createOrder: vi.fn(async () => ({
        status: "pending-order-exists" as const,
        order: stranded,
      })),
    });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(provider.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: stranded.id,
        amountCentavos: stranded.amountCentavos,
      }),
    );
    expect(store.attachCharge).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: stranded.id }),
    );
    expect(
      logLines(logInfo).some((line) => line.startsWith("pix.order-resumed")),
    ).toBe(true);
  });

  it("uses the stranded order's own amount when resuming, not the newly requested package", async () => {
    const session = makeSession();
    const stranded = makeOrder({
      packageId: "coins-100",
      coins: 100,
      amountCentavos: 1_000,
      providerPaymentId: null,
      brcode: null,
    });
    const store = makeStore({
      createOrder: vi.fn(async () => ({
        status: "pending-order-exists" as const,
        order: stranded,
      })),
    });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-10000" },
      10_000,
    );
    await flush(service);
    expect(provider.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: stranded.id, amountCentavos: 1_000 }),
    );
  });

  it("answers unavailable when the provider fails to create a charge, exposing no detail", async () => {
    const session = makeSession();
    const store = makeStore();
    const provider = makeProvider({
      createCharge: vi.fn(async () => {
        throw new Error(
          "mercadopago POST /v1/payments failed: 500 token=secret",
        );
      }),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(store.attachCharge).not.toHaveBeenCalled();
    expect(session.sent).toEqual([
      { type: "coin-order-failed", reason: "unavailable" },
    ]);
    expect(JSON.stringify(session.sent)).not.toContain("mercadopago");
  });

  it("answers unavailable when the store fails, and never contacts the provider", async () => {
    const session = makeSession();
    const store = makeStore({
      createOrder: vi.fn(async () => {
        throw new Error("connection refused");
      }),
    });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(provider.createCharge).not.toHaveBeenCalled();
    expect(session.sent).toEqual([
      { type: "coin-order-failed", reason: "unavailable" },
    ]);
    expect(logLines(logWarn).some((line) => line.includes("op=create"))).toBe(
      true,
    );
  });

  it("closes an orphaned provider charge when the order left pending mid-create", async () => {
    const session = makeSession();
    const store = makeStore({ attachCharge: vi.fn(async () => null) });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(provider.cancelPayment).toHaveBeenCalledWith(PAYMENT_ID);
    expect(session.sent).toEqual([
      { type: "coin-order-failed", reason: "failed" },
    ]);
    expect(
      logLines(logWarn).some((line) => line.startsWith("pix.charge-orphaned")),
    ).toBe(true);
  });

  it("escalates when an orphaned charge cannot be closed at the provider", async () => {
    const session = makeSession();
    const store = makeStore({ attachCharge: vi.fn(async () => null) });
    const provider = makeProvider({ cancelPayment: vi.fn(async () => false) });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(
      logLines(logError).some(
        (line) =>
          line.includes("pix.charge-orphan-cancel") &&
          line.includes("cancelled=false"),
      ),
    ).toBe(true);
  });

  it("never hands the brcode or payer e-mail to the log", async () => {
    const session = makeSession();
    const service = new PixOrderService(
      registryOf(session),
      makeStore(),
      makeProvider(),
    );
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    const everything = [
      ...logLines(logInfo),
      ...logLines(logWarn),
      ...logLines(logError),
    ].join("\n");
    expect(everything).not.toContain("00020126pixpayload");
    expect(everything).not.toContain("buyer@example.com");
  });

  it("falls back to the configured payer e-mail when the account has none", async () => {
    const session = makeSession();
    session.account = { ...session.account!, email: null };
    const provider = makeProvider();
    const service = new PixOrderService(
      registryOf(session),
      makeStore(),
      provider,
      {
        payerEmailFallback: "fallback@mantus.app",
      },
    );
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    expect(provider.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ payerEmail: "fallback@mantus.app" }),
    );
  });
});

describe("PixOrderService: cancel", () => {
  it("cancels at the provider before cancelling locally", async () => {
    const session = makeSession();
    const order = makeOrder();
    const calls: string[] = [];
    const store = makeStore({
      openOrderFor: vi.fn(async () => order),
      cancelOrder: vi.fn(async () => {
        calls.push("store");
        return "cancelled" as const;
      }),
    });
    const provider = makeProvider({
      cancelPayment: vi.fn(async () => {
        calls.push("provider");
        return true;
      }),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-cancel", orderId: ORDER_ID },
      10_000,
    );
    await flush(service);
    expect(calls).toEqual(["provider", "store"]);
    expect(store.cancelOrder).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      accountId: ACCOUNT_ID,
      characterId: CHARACTER_ID,
    });
    expect(session.sent).toContainEqual(
      expect.objectContaining({ type: "coin-order-state", order: null }),
    );
  });

  it("keeps the order alive when the provider refuses the cancel (paid race) and settles it", async () => {
    const session = makeSession(50);
    const order = makeOrder();
    const store = makeStore({
      openOrderFor: vi.fn(async () => order),
      settleApproved: vi.fn(async () => credited()),
    });
    const provider = makeProvider({
      cancelPayment: vi.fn(async () => false),
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-cancel", orderId: ORDER_ID },
      10_000,
    );
    await flush(service);
    expect(store.cancelOrder).not.toHaveBeenCalled();
    expect(session.sent).toContainEqual({
      type: "coin-order-failed",
      reason: "cancel-failed",
    });
    expect(store.settleApproved).toHaveBeenCalled();
    expect(session.sent).toContainEqual(
      expect.objectContaining({ type: "coin-order-completed", coins: 100 }),
    );
    expect(session.account?.mantusCoins).toBe(150);
  });

  it("refuses to cancel an order id that is not the account's open order", async () => {
    const session = makeSession();
    const store = makeStore({ openOrderFor: vi.fn(async () => makeOrder()) });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      {
        type: "coin-order-cancel",
        orderId: "00000000-0000-4000-8000-0000000000ff",
      },
      10_000,
    );
    await flush(service);
    expect(provider.cancelPayment).not.toHaveBeenCalled();
    expect(store.cancelOrder).not.toHaveBeenCalled();
    expect(session.sent).toContainEqual({
      type: "coin-order-failed",
      reason: "order-not-found",
    });
  });

  it("only ever looks up the open order of the session's own account", async () => {
    const attacker = makeSession(0, OTHER_ACCOUNT_ID);
    const victimOrder = makeOrder();
    const store = makeStore({
      openOrderFor: vi.fn(async (accountId: string) =>
        accountId === ACCOUNT_ID ? victimOrder : null,
      ),
    });
    const provider = makeProvider();
    const service = new PixOrderService(
      makeRegistry({ [OTHER_ACCOUNT_ID]: attacker }),
      store,
      provider,
    );
    service.handle(
      attacker,
      { type: "coin-order-cancel", orderId: ORDER_ID },
      10_000,
    );
    await flush(service);
    expect(store.openOrderFor).toHaveBeenCalledWith(OTHER_ACCOUNT_ID);
    expect(store.openOrderFor).not.toHaveBeenCalledWith(ACCOUNT_ID);
    expect(provider.cancelPayment).not.toHaveBeenCalled();
    expect(store.cancelOrder).not.toHaveBeenCalled();
    expect(attacker.sent).toContainEqual({
      type: "coin-order-failed",
      reason: "order-not-found",
    });
  });

  it("cancels a stranded order (no charge yet) without contacting the provider", async () => {
    const session = makeSession();
    const stranded = makeOrder({ providerPaymentId: null, brcode: null });
    const store = makeStore({ openOrderFor: vi.fn(async () => stranded) });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-cancel", orderId: ORDER_ID },
      10_000,
    );
    await flush(service);
    expect(provider.cancelPayment).not.toHaveBeenCalled();
    expect(store.cancelOrder).toHaveBeenCalledTimes(1);
  });

  it("answers unavailable when the provider cancel throws, leaving the order untouched", async () => {
    const session = makeSession();
    const store = makeStore({ openOrderFor: vi.fn(async () => makeOrder()) });
    const provider = makeProvider({
      cancelPayment: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-cancel", orderId: ORDER_ID },
      10_000,
    );
    await flush(service);
    expect(store.cancelOrder).not.toHaveBeenCalled();
    expect(session.sent).toEqual([
      { type: "coin-order-failed", reason: "unavailable" },
    ]);
  });

  it("reports order-not-found when the local cancel loses to expiry/settle", async () => {
    const session = makeSession();
    const store = makeStore({
      openOrderFor: vi.fn(async () => makeOrder()),
      cancelOrder: vi.fn(async () => "not-found" as const),
    });
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    service.handle(
      session,
      { type: "coin-order-cancel", orderId: ORDER_ID },
      10_000,
    );
    await flush(service);
    expect(session.sent).toEqual([
      { type: "coin-order-failed", reason: "order-not-found" },
    ]);
  });
});

describe("PixOrderService: settlement", () => {
  it("credits a settled payment relatively into the live session", async () => {
    const session = makeSession(50);
    const store = makeStore({
      settleApproved: vi.fn(async () => credited(100, 9_999)),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(150);
    expect(session.sent).toContainEqual({
      type: "coin-order-completed",
      orderId: ORDER_ID,
      coins: 100,
      balance: 150,
    });
  });

  it("hands the provider's amount, currency and reference to settle for cross-checking", async () => {
    const session = makeSession(50);
    const store = makeStore({ settleApproved: vi.fn(async () => credited()) });
    const provider = makeProvider({
      getPayment: vi.fn(async () =>
        makePayment({
          status: "approved",
          amountCentavos: 1_000,
          currency: "BRL",
          externalReference: ORDER_ID,
          snapshot: { id: PAYMENT_ID },
        }),
      ),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(store.settleApproved).toHaveBeenCalledWith({
      providerPaymentId: PAYMENT_ID,
      amountCentavos: 1_000,
      currency: "BRL",
      externalReference: ORDER_ID,
      snapshot: { id: PAYMENT_ID },
    });
  });

  it("clamps the live balance at the store cap", async () => {
    const session = makeSession(STORE_LIMITS.maxBalance - 10);
    const store = makeStore({
      settleApproved: vi.fn(async () => credited(100, STORE_LIMITS.maxBalance)),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(STORE_LIMITS.maxBalance);
  });

  it("credits the account's live session even if it is a different socket than the buyer's", async () => {
    const relogged = makeSession(0);
    const store = makeStore({ settleApproved: vi.fn(async () => credited()) });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(relogged), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(relogged.account?.mantusCoins).toBe(100);
  });

  it("applies nothing in memory when the account is offline (the DB row is the truth)", async () => {
    const store = makeStore({ settleApproved: vi.fn(async () => credited()) });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(makeRegistry({}), store, provider);
    service.notify(PAYMENT_ID);
    await expect(flush(service)).resolves.toBeUndefined();
    expect(store.settleApproved).toHaveBeenCalledTimes(1);
  });

  it("never credits on a refused settle and raises an error-level log", async () => {
    for (const reason of [
      "amount-mismatch",
      "amount-unknown",
      "currency-mismatch",
      "reference-mismatch",
    ] as const) {
      const session = makeSession(50);
      const store = makeStore({
        settleApproved: vi.fn(async () => ({
          status: "refused" as const,
          reason,
          orderId: ORDER_ID,
        })),
      });
      const provider = makeProvider({
        getPayment: vi.fn(async () =>
          makePayment({ status: "approved", amountCentavos: 1 }),
        ),
      });
      const service = new PixOrderService(registryOf(session), store, provider);
      service.notify(PAYMENT_ID);
      await flush(service);
      expect(session.account?.mantusCoins).toBe(50);
      expect(session.sent).toEqual([]);
      expect(
        logLines(logError).some(
          (line) =>
            line.startsWith("pix.settle-refused") &&
            line.includes(`reason=${reason}`),
        ),
      ).toBe(true);
    }
  });

  it("does not credit when the credit is parked at the balance cap", async () => {
    const session = makeSession(50);
    const store = makeStore({
      settleApproved: vi.fn(async () => ({
        status: "balance-limit" as const,
        orderId: ORDER_ID,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(50);
    expect(session.sent).toEqual([]);
    expect(
      logLines(logError).some((line) => line.startsWith("pix.credit-parked")),
    ).toBe(true);
  });

  it("applies nothing on a replayed (already-settled) webhook", async () => {
    const session = makeSession(50);
    const store = makeStore({
      settleApproved: vi.fn(async () => ({
        status: "already-settled" as const,
        orderId: ORDER_ID,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    service.notify(PAYMENT_ID);
    await flush(service);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(50);
    expect(session.sent).toEqual([]);
    expect(
      logLines(logInfo).filter((line) =>
        line.startsWith("pix.settle-replayed"),
      ),
    ).toHaveLength(2);
  });

  it("only ever credits through settle, even for unknown payments", async () => {
    const session = makeSession(50);
    const store = makeStore();
    const provider = makeProvider({
      getPayment: vi.fn(async () =>
        makePayment({
          status: "approved",
          amountCentavos: 999_999,
          externalReference: null,
        }),
      ),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify("111222333");
    await flush(service);
    expect(session.account?.mantusCoins).toBe(50);
    expect(session.sent).toEqual([]);
    expect(
      logLines(logWarn).some((line) =>
        line.startsWith("pix.approved-payment-unmatched"),
      ),
    ).toBe(true);
  });

  it("touches no store method for a pending payment", async () => {
    const store = makeStore();
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "pending" })),
    });
    const service = new PixOrderService(makeRegistry({}), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(store.settleApproved).not.toHaveBeenCalled();
    expect(store.markRefunded).not.toHaveBeenCalled();
    expect(store.markProviderCancelled).not.toHaveBeenCalled();
  });

  it("touches no store method and warns for an unknown provider status", async () => {
    const store = makeStore();
    const provider = makeProvider({
      getPayment: vi.fn(async () =>
        makePayment({
          status: "unknown",
          snapshot: { status: "in_mediation" },
        }),
      ),
    });
    const service = new PixOrderService(makeRegistry({}), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(store.settleApproved).not.toHaveBeenCalled();
    expect(store.markRefunded).not.toHaveBeenCalled();
    expect(
      logLines(logWarn).some(
        (line) =>
          line.includes("pix.payment-status-unknown") &&
          line.includes("in_mediation"),
      ),
    ).toBe(true);
  });

  it("swallows a provider fetch failure without touching balances", async () => {
    const session = makeSession(50);
    const store = makeStore();
    const provider = makeProvider({
      getPayment: vi.fn(async () => {
        throw new Error("mercadopago GET /v1/payments failed: 503");
      }),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await expect(flush(service)).resolves.toBeUndefined();
    expect(store.settleApproved).not.toHaveBeenCalled();
    expect(session.account?.mantusCoins).toBe(50);
    expect(
      logLines(logWarn).some((line) => line.includes("op=payment-check")),
    ).toBe(true);
  });

  it("coalesces a webhook burst for one payment into a single provider check", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = makeStore({ settleApproved: vi.fn(async () => credited()) });
    const provider = makeProvider({
      getPayment: vi.fn(async () => {
        await gate;
        return makePayment({ status: "approved" });
      }),
    });
    const session = makeSession(0);
    const service = new PixOrderService(registryOf(session), store, provider);
    for (let index = 0; index < 50; index += 1) service.notify(PAYMENT_ID);
    release();
    await flush(service);
    expect(provider.getPayment).toHaveBeenCalledTimes(1);
    expect(store.settleApproved).toHaveBeenCalledTimes(1);
    expect(session.account?.mantusCoins).toBe(100);
    expect(
      logLines(logInfo).filter((line) =>
        line.startsWith("pix.payment-check-coalesced"),
      ),
    ).toHaveLength(49);
  });

  it("checks distinct payments independently while coalescing", async () => {
    const provider = makeProvider();
    const service = new PixOrderService(
      makeRegistry({}),
      makeStore(),
      provider,
    );
    service.notify("1");
    service.notify("2");
    service.notify("1");
    await flush(service);
    expect(provider.getPayment).toHaveBeenCalledTimes(2);
  });

  it("checks the same payment again once the previous check has finished", async () => {
    const provider = makeProvider();
    const service = new PixOrderService(
      makeRegistry({}),
      makeStore(),
      provider,
    );
    service.notify(PAYMENT_ID);
    await flush(service);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(provider.getPayment).toHaveBeenCalledTimes(2);
  });

  it("frees the in-flight slot even when the check throws", async () => {
    const provider = makeProvider({
      getPayment: vi
        .fn<PixProvider["getPayment"]>()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue(makePayment()),
    });
    const service = new PixOrderService(
      makeRegistry({}),
      makeStore(),
      provider,
    );
    service.notify(PAYMENT_ID);
    await flush(service);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(provider.getPayment).toHaveBeenCalledTimes(2);
  });
});

describe("PixOrderService: refunds and provider cancels", () => {
  it("claws back a refunded payment, clamped at zero", async () => {
    const session = makeSession(30);
    const store = makeStore({
      markRefunded: vi.fn(async () => ({
        status: "refunded" as const,
        orderId: ORDER_ID,
        accountId: ACCOUNT_ID,
        coinsDebited: 100,
        balance: 0,
        complete: true,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "refunded" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(0);
    expect(store.markRefunded).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPaymentId: PAYMENT_ID,
        externalReference: ORDER_ID,
      }),
    );
    expect(
      logLines(logWarn).some(
        (line) =>
          line.startsWith("pix.refunded") && line.includes("coinsDebited=100"),
      ),
    ).toBe(true);
  });

  it("debits nothing in memory for a refund that clawed back zero coins", async () => {
    const session = makeSession(30);
    const store = makeStore({
      markRefunded: vi.fn(async () => ({
        status: "refunded" as const,
        orderId: ORDER_ID,
        accountId: ACCOUNT_ID,
        coinsDebited: 0,
        balance: 0,
        complete: true,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "refunded" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(30);
  });

  it("debits nothing on a replayed refund", async () => {
    const session = makeSession(30);
    const store = makeStore({
      markRefunded: vi.fn(async () => ({
        status: "already-refunded" as const,
        orderId: ORDER_ID,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "refunded" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(30);
  });

  it("debits nothing when the refund is refused for a reference mismatch", async () => {
    const session = makeSession(30);
    const store = makeStore({
      markRefunded: vi.fn(async () => ({
        status: "refused" as const,
        reason: "reference-mismatch" as const,
        orderId: ORDER_ID,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () =>
        makePayment({ status: "refunded", externalReference: "someone-else" }),
      ),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(30);
    expect(
      logLines(logError).some((line) => line.startsWith("pix.refund-refused")),
    ).toBe(true);
  });

  it("clears the client's open order when the provider cancels the charge", async () => {
    const session = makeSession(30);
    const store = makeStore({
      markProviderCancelled: vi.fn(async () =>
        makeOrder({ status: "cancelled" }),
      ),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "cancelled" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.sent).toEqual([
      expect.objectContaining({ type: "coin-order-state", order: null }),
    ]);
    expect(session.account?.mantusCoins).toBe(30);
  });

  it("stays quiet when a provider cancel matches no pending order", async () => {
    const session = makeSession(30);
    const store = makeStore({ markProviderCancelled: vi.fn(async () => null) });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "cancelled" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.sent).toEqual([]);
  });
});

describe("PixOrderService: open", () => {
  it("re-checks an open order with the provider on open, throttled per account", async () => {
    const session = makeSession();
    const store = makeStore({ openOrderFor: vi.fn(async () => makeOrder()) });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(session, { type: "coin-order-open" }, 10_000);
    service.handle(session, { type: "coin-order-open" }, 12_000);
    await flush(service);
    expect(provider.getPayment).toHaveBeenCalledTimes(1);
    expect(provider.getPayment).toHaveBeenCalledWith(PAYMENT_ID);
    service.handle(session, { type: "coin-order-open" }, 25_000);
    await flush(service);
    expect(provider.getPayment).toHaveBeenCalledTimes(2);
  });

  it("does not contact the provider on open without an open order", async () => {
    const session = makeSession();
    const provider = makeProvider();
    const service = new PixOrderService(
      registryOf(session),
      makeStore(),
      provider,
    );
    service.handle(session, { type: "coin-order-open" }, 10_000);
    await flush(service);
    expect(provider.getPayment).not.toHaveBeenCalled();
    expect(session.sent).toContainEqual(
      expect.objectContaining({ type: "coin-order-state", order: null }),
    );
  });

  it("does not contact the provider for a stranded order without a charge", async () => {
    const session = makeSession();
    const provider = makeProvider();
    const store = makeStore({
      openOrderFor: vi.fn(async () =>
        makeOrder({ providerPaymentId: null, brcode: null }),
      ),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(session, { type: "coin-order-open" }, 10_000);
    await flush(service);
    expect(provider.getPayment).not.toHaveBeenCalled();
    expect(session.sent).toContainEqual(
      expect.objectContaining({ type: "coin-order-state", order: null }),
    );
  });

  it("sends the catalog and only the wire-safe fields of the open order", async () => {
    const session = makeSession();
    const store = makeStore({ openOrderFor: vi.fn(async () => makeOrder()) });
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    service.handle(session, { type: "coin-order-open" }, 10_000);
    await flush(service);
    const state = session.sent.find(
      (message) => message.type === "coin-order-state",
    );
    expect(state).toEqual({
      type: "coin-order-state",
      packages: [...PIX_COIN_PACKAGES],
      order: {
        id: ORDER_ID,
        packageId: "coins-100",
        coins: 100,
        amountCentavos: 1_000,
        brcode: "00020126pixpayload6304ABCD",
        expiresAt: expect.any(String),
      },
    });
    expect(JSON.stringify(state)).not.toContain(ACCOUNT_ID);
    expect(JSON.stringify(state)).not.toContain(PAYMENT_ID);
  });

  it("answers unavailable when the store read fails", async () => {
    const session = makeSession();
    const store = makeStore({
      openOrderFor: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    service.handle(session, { type: "coin-order-open" }, 10_000);
    await flush(service);
    expect(session.sent).toEqual([
      { type: "coin-order-failed", reason: "unavailable" },
    ]);
  });
});

describe("PixOrderService: tick discipline", () => {
  it("answers only inside applyResolvedOutcomes, never from the promise callback", async () => {
    const session = makeSession();
    const service = new PixOrderService(
      registryOf(session),
      makeStore(),
      makeProvider(),
    );
    service.handle(session, { type: "coin-order-open" }, 10_000);
    await service.stop();
    expect(session.sent).toEqual([]);
    service.applyResolvedOutcomes();
    expect(session.sent).toHaveLength(1);
  });

  it("drops an answer whose session was replaced before the DB round trip resolved", async () => {
    const stale = makeSession();
    const fresh = makeSession();
    const registry = makeRegistry({ [ACCOUNT_ID]: stale });
    const service = new PixOrderService(registry, makeStore(), makeProvider());
    service.handle(
      stale,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    (
      registry as unknown as {
        sessionForAccount: (id: string) => Session | undefined;
      }
    ).sessionForAccount = (id: string) =>
      id === ACCOUNT_ID ? fresh : undefined;
    await flush(service);
    expect(stale.sent).toEqual([]);
    expect(fresh.sent).toEqual([]);
  });

  it("mutates the balance exactly once per settled payment across repeated applies", async () => {
    const session = makeSession(50);
    const store = makeStore({ settleApproved: vi.fn(async () => credited()) });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    service.applyResolvedOutcomes();
    service.applyResolvedOutcomes();
    expect(session.account?.mantusCoins).toBe(150);
    expect(
      session.sent.filter((message) => message.type === "coin-order-completed"),
    ).toHaveLength(1);
  });

  it("keeps the throttle maps bounded", async () => {
    const store = makeStore();
    const service = new PixOrderService(
      makeRegistry({}),
      store,
      makeProvider(),
    );
    const now = 1_000_000;
    for (let index = 0; index < 10_050; index += 1) {
      const session = makeSession(0, `account-${index}`);
      service.handle(
        session,
        { type: "coin-order-create", packageId: "coins-100" },
        now + index * 1_000,
      );
    }
    await flush(service);
    const cooldowns = (
      service as unknown as { cooldownByAccount: Map<string, number> }
    ).cooldownByAccount;
    expect(cooldowns.size).toBeLessThan(100);
    expect(cooldowns.has("account-10049")).toBe(true);
  });
});

describe("PixOrderService: reconciliation", () => {
  it("expires stale orders, cancels their charges and clears the live client", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    const stale = makeOrder();
    const store = makeStore({ expireStale: vi.fn(async () => [stale]) });
    const provider = makeProvider();
    const service = new PixOrderService(registryOf(session), store, provider, {
      reconcileIntervalMs: 1_000,
    });
    service.startReconciliation();
    await vi.advanceTimersByTimeAsync(1_000);
    await flush(service);
    expect(provider.cancelPayment).toHaveBeenCalledWith(PAYMENT_ID);
    expect(session.sent).toContainEqual(
      expect.objectContaining({ type: "coin-order-state", order: null }),
    );
    expect(
      logLines(logInfo).some((line) => line.startsWith("pix.order-expired")),
    ).toBe(true);
  });

  it("settles an expired order whose charge the provider refuses to cancel (paid at the deadline)", async () => {
    vi.useFakeTimers();
    const session = makeSession(0);
    const store = makeStore({
      expireStale: vi.fn(async () => [makeOrder()]),
      settleApproved: vi.fn(async () => credited()),
    });
    const provider = makeProvider({
      cancelPayment: vi.fn(async () => false),
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider, {
      reconcileIntervalMs: 1_000,
    });
    service.startReconciliation();
    await vi.advanceTimersByTimeAsync(1_000);
    await flush(service);
    expect(store.settleApproved).toHaveBeenCalledTimes(1);
    expect(session.account?.mantusCoins).toBe(100);
    expect(
      logLines(logWarn).some((line) =>
        line.startsWith("pix.expire-cancel-refused"),
      ),
    ).toBe(true);
  });

  it("keeps sweeping when one expire-cancel throws", async () => {
    vi.useFakeTimers();
    const store = makeStore({
      expireStale: vi.fn(async () => [
        makeOrder({ id: "a", providerPaymentId: "1" }),
        makeOrder({ id: "b", providerPaymentId: "2" }),
      ]),
    });
    const provider = makeProvider({
      cancelPayment: vi
        .fn<PixProvider["cancelPayment"]>()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue(true),
    });
    const service = new PixOrderService(makeRegistry({}), store, provider, {
      reconcileIntervalMs: 1_000,
    });
    service.startReconciliation();
    await vi.advanceTimersByTimeAsync(1_000);
    await flush(service);
    expect(provider.cancelPayment).toHaveBeenCalledTimes(2);
    expect(store.claimForReconciliation).toHaveBeenCalledTimes(1);
  });

  it("re-checks open orders older than the minimum age, skipping ones without a charge", async () => {
    vi.useFakeTimers();
    const store = makeStore({
      claimForReconciliation: vi.fn(async () => [
        makeOrder({ id: "a", providerPaymentId: "1" }),
        makeOrder({ id: "b", providerPaymentId: null }),
        makeOrder({ id: "c", providerPaymentId: "3" }),
      ]),
    });
    const provider = makeProvider();
    const service = new PixOrderService(makeRegistry({}), store, provider, {
      reconcileIntervalMs: 1_000,
      minReconcileAgeMs: 5_000,
    });
    service.startReconciliation();
    await vi.advanceTimersByTimeAsync(1_000);
    await flush(service);
    expect(store.claimForReconciliation).toHaveBeenCalledWith(
      expect.any(Date),
      50,
    );
    const olderThan = (store.claimForReconciliation as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0] as Date;
    expect(Date.now() - olderThan.getTime()).toBe(5_000);
    expect(provider.getPayment).toHaveBeenCalledTimes(2);
    expect(provider.getPayment).toHaveBeenCalledWith("1");
    expect(provider.getPayment).toHaveBeenCalledWith("3");
    expect(
      logLines(logInfo).some(
        (line) =>
          line.startsWith("pix.reconcile-sweep") && line.includes("checked=2"),
      ),
    ).toBe(true);
  });

  it("keeps sweeping when one payment check throws", async () => {
    vi.useFakeTimers();
    const store = makeStore({
      claimForReconciliation: vi.fn(async () => [
        makeOrder({ id: "a", providerPaymentId: "1" }),
        makeOrder({ id: "b", providerPaymentId: "2" }),
      ]),
    });
    const provider = makeProvider({
      getPayment: vi
        .fn<PixProvider["getPayment"]>()
        .mockRejectedValueOnce(new Error("503"))
        .mockResolvedValue(makePayment()),
    });
    const service = new PixOrderService(makeRegistry({}), store, provider, {
      reconcileIntervalMs: 1_000,
    });
    service.startReconciliation();
    await vi.advanceTimersByTimeAsync(1_000);
    await flush(service);
    expect(provider.getPayment).toHaveBeenCalledTimes(2);
    expect(
      logLines(logWarn).some(
        (line) => line.includes("op=reconcile") && line.includes("orderId=a"),
      ),
    ).toBe(true);
  });

  it("never runs two sweeps at once", async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = makeStore({
      expireStale: vi.fn(async () => {
        await gate;
        return [];
      }),
    });
    const service = new PixOrderService(
      makeRegistry({}),
      store,
      makeProvider(),
      { reconcileIntervalMs: 100 },
    );
    service.startReconciliation();
    await vi.advanceTimersByTimeAsync(350);
    expect(store.expireStale).toHaveBeenCalledTimes(1);
    release();
    await flush(service);
  });

  it("starts one timer no matter how often it is asked, and stop() clears it", async () => {
    vi.useFakeTimers();
    const store = makeStore();
    const service = new PixOrderService(
      makeRegistry({}),
      store,
      makeProvider(),
      { reconcileIntervalMs: 100 },
    );
    service.startReconciliation();
    service.startReconciliation();
    await vi.advanceTimersByTimeAsync(100);
    expect(store.expireStale).toHaveBeenCalledTimes(1);
    await service.stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.expireStale).toHaveBeenCalledTimes(1);
  });

  it("survives a sweep whose store call throws", async () => {
    vi.useFakeTimers();
    const store = makeStore({
      expireStale: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const service = new PixOrderService(
      makeRegistry({}),
      store,
      makeProvider(),
      { reconcileIntervalMs: 100 },
    );
    service.startReconciliation();
    await vi.advanceTimersByTimeAsync(200);
    await flush(service);
    expect(store.expireStale).toHaveBeenCalledTimes(2);
    expect(
      logLines(logWarn).some((line) => line.includes("op=reconcile-sweep")),
    ).toBe(true);
  });
});

describe("PixOrderService: forensic log trail", () => {
  it("logs the full happy path with the ids needed to join orders, audit and provider", async () => {
    const session = makeSession(0);
    const store = makeStore({ settleApproved: vi.fn(async () => credited()) });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      10_000,
    );
    await flush(service);
    service.notify(PAYMENT_ID);
    await flush(service);
    const lines = logLines(logInfo);
    const events = lines.map((line) => line.split(" ")[0]);
    expect(events).toEqual([
      "pix.order-created",
      "pix.charge-attached",
      "pix.payment-fetched",
      "pix.credited",
    ]);
    expect(lines[0]).toContain(`accountId=${ACCOUNT_ID}`);
    expect(lines[0]).toContain("coins=100");
    expect(lines[0]).toContain("amountCentavos=1000");
    expect(lines[1]).toContain(`paymentId=${PAYMENT_ID}`);
    expect(lines[3]).toContain(`orderId=${ORDER_ID}`);
    expect(lines[3]).toContain("balance=150");
  });

  it("logs the cancel path, including the provider payment id", async () => {
    const session = makeSession();
    const store = makeStore({ openOrderFor: vi.fn(async () => makeOrder()) });
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    service.handle(
      session,
      { type: "coin-order-cancel", orderId: ORDER_ID },
      10_000,
    );
    await flush(service);
    expect(logLines(logInfo)).toContainEqual(
      expect.stringMatching(
        /^pix\.order-cancelled .*orderId=.* paymentId=987654321 result=cancelled$/,
      ),
    );
  });

  it("logs rate-limited and unauthenticated intents with the account and intent type", async () => {
    const session = makeSession();
    const service = new PixOrderService(
      registryOf(session),
      makeStore(),
      makeProvider(),
    );
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      1_000,
    );
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-100" },
      1_001,
    );
    service.handle(
      makeSession(0, null),
      { type: "coin-order-create", packageId: "coins-100" },
      1_002,
    );
    await flush(service);
    expect(logLines(logWarn)).toContainEqual(
      `pix.intent-rate-limited intent=coin-order-create accountId=${ACCOUNT_ID}`,
    );
    expect(logLines(logWarn)).toContainEqual(
      "pix.intent-unauthenticated intent=coin-order-create",
    );
  });
});

describe("PixOrderService: payment adoption", () => {
  it("adopts an unmatched approved payment onto the order its reference names, then settles it", async () => {
    const session = makeSession(0);
    const settle = vi
      .fn<PixOrderStore["settleApproved"]>()
      .mockResolvedValueOnce({ status: "not-found" })
      .mockResolvedValueOnce(credited());
    const store = makeStore({
      settleApproved: settle,
      adoptPayment: vi.fn(async () =>
        makeOrder({ providerPaymentId: PAYMENT_ID }),
      ),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(store.adoptPayment).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      providerPaymentId: PAYMENT_ID,
    });
    expect(settle).toHaveBeenCalledTimes(2);
    expect(session.account?.mantusCoins).toBe(100);
    expect(logLines(logWarn)).toContainEqual(
      `pix.payment-adopt paymentId=${PAYMENT_ID} orderId=${ORDER_ID} adopted=true orderStatus=pending`,
    );
  });

  it("never adopts when the reference is missing or not one of our order ids", async () => {
    for (const externalReference of [
      null,
      "",
      "order-1",
      "123",
      "'; DROP TABLE pix_orders; --",
    ]) {
      const store = makeStore();
      const provider = makeProvider({
        getPayment: vi.fn(async () =>
          makePayment({ status: "approved", externalReference }),
        ),
      });
      const service = new PixOrderService(makeRegistry({}), store, provider);
      service.notify(PAYMENT_ID);
      await flush(service);
      expect(store.adoptPayment).not.toHaveBeenCalled();
      expect(store.settleApproved).toHaveBeenCalledTimes(1);
    }
  });

  it("gives up cleanly when the referenced order will not adopt the payment", async () => {
    const session = makeSession(0);
    const store = makeStore({ adoptPayment: vi.fn(async () => null) });
    const provider = makeProvider({
      getPayment: vi.fn(async () => makePayment({ status: "approved" })),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(store.settleApproved).toHaveBeenCalledTimes(1);
    expect(session.account?.mantusCoins).toBe(0);
    expect(
      logLines(logWarn).some((line) =>
        line.startsWith("pix.approved-payment-unmatched"),
      ),
    ).toBe(true);
  });
});

describe("PixOrderService: partial refunds", () => {
  it("claws back the refunded share of an approved payment the provider partially refunded", async () => {
    const session = makeSession(100);
    const store = makeStore({
      settleApproved: vi.fn(async () => ({
        status: "already-settled" as const,
        orderId: ORDER_ID,
      })),
      markRefunded: vi.fn(async () => ({
        status: "refunded" as const,
        orderId: ORDER_ID,
        accountId: ACCOUNT_ID,
        coinsDebited: 30,
        balance: 70,
        complete: false,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () =>
        makePayment({ status: "approved", refundedCentavos: 300 }),
      ),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(store.markRefunded).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPaymentId: PAYMENT_ID,
        refundedCentavos: 300,
        externalReference: ORDER_ID,
      }),
    );
    expect(session.account?.mantusCoins).toBe(70);
    expect(
      logLines(logWarn).some(
        (line) =>
          line.startsWith("pix.refunded-partially") &&
          line.includes("coinsDebited=30"),
      ),
    ).toBe(true);
  });

  it("credits first and then applies the partial refund when both arrive in one report", async () => {
    const session = makeSession(0);
    const calls: string[] = [];
    const store = makeStore({
      settleApproved: vi.fn(async () => {
        calls.push("settle");
        return credited(100, 100);
      }),
      markRefunded: vi.fn(async () => {
        calls.push("refund");
        return {
          status: "refunded" as const,
          orderId: ORDER_ID,
          accountId: ACCOUNT_ID,
          coinsDebited: 30,
          balance: 70,
          complete: false,
        };
      }),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () =>
        makePayment({ status: "approved", refundedCentavos: 300 }),
      ),
    });
    const service = new PixOrderService(registryOf(session), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(calls).toEqual(["settle", "refund"]);
    expect(session.account?.mantusCoins).toBe(70);
  });

  it("ignores a zero refunded amount on an approved payment", async () => {
    const store = makeStore({
      settleApproved: vi.fn(async () => ({
        status: "already-settled" as const,
        orderId: ORDER_ID,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () =>
        makePayment({ status: "approved", refundedCentavos: 0 }),
      ),
    });
    const service = new PixOrderService(makeRegistry({}), store, provider);
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(store.markRefunded).not.toHaveBeenCalled();
  });

  it("treats a refunded status as the whole payment, whatever amount the report carries", async () => {
    for (const refundedCentavos of [1_000, 300, null]) {
      const store = makeStore();
      const provider = makeProvider({
        getPayment: vi.fn(async () =>
          makePayment({ status: "refunded", refundedCentavos }),
        ),
      });
      const service = new PixOrderService(makeRegistry({}), store, provider);
      service.notify(PAYMENT_ID);
      await flush(service);
      expect(store.markRefunded).toHaveBeenCalledWith(
        expect.objectContaining({ refundedCentavos: null }),
      );
    }
  });
});

describe("PixOrderService: operator commands", () => {
  const OPERATOR = "00000000-0000-4000-8000-0000000000ee";
  const replies = () => {
    const lines: Array<{ ok: boolean; text: string }> = [];
    const reply = (_session: Session, ok: boolean, text: string) => {
      lines.push({ ok, text });
    };
    return { lines, reply };
  };

  it("inspects by order id, audits the read and keeps each line under the gm-response cap", async () => {
    const session = makeSession();
    const store = makeStore({
      orderById: vi.fn(async () => makeOrder({ refundedCentavos: 250 })),
    });
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    const { lines, reply } = replies();
    service.inspect(session, OPERATOR, ORDER_ID, reply);
    await flush(service);
    expect(store.orderById).toHaveBeenCalledWith(ORDER_ID);
    expect(store.recordOperatorInspect).toHaveBeenCalledWith({
      operatorCharacterId: OPERATOR,
      subject: ORDER_ID,
    });
    expect(lines).toEqual([
      {
        ok: true,
        text: `${ORDER_ID} pending 100c R$10.00 2026-08-30 12:00Z pay=${PAYMENT_ID} refunded=2.50`,
      },
    ]);
    expect(lines[0]!.text.length).toBeLessThanOrEqual(200);
  });

  it("inspects by character name through the account, newest five orders", async () => {
    const session = makeSession();
    const store = makeStore({
      accountIdByCharacterName: vi.fn(async () => OTHER_ACCOUNT_ID),
      recentOrdersForAccount: vi.fn(async () => [
        makeOrder({ id: "a".repeat(8) + ORDER_ID.slice(8) }),
        makeOrder(),
      ]),
    });
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    const { lines, reply } = replies();
    service.inspect(session, OPERATOR, "Pix  Hero", reply);
    await flush(service);
    expect(store.accountIdByCharacterName).toHaveBeenCalledWith("pix hero");
    expect(store.recentOrdersForAccount).toHaveBeenCalledWith(
      OTHER_ACCOUNT_ID,
      5,
    );
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.ok && line.text.length <= 200)).toBe(
      true,
    );
  });

  it("answers the same way for an unknown name, an invalid name and an unknown order", async () => {
    const session = makeSession();
    const store = makeStore();
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    const { lines, reply } = replies();
    service.inspect(session, OPERATOR, "Nobody", reply);
    service.inspect(session, OPERATOR, "x", reply);
    service.inspect(session, OPERATOR, ORDER_ID, reply);
    await flush(service);
    expect(lines).toEqual([
      { ok: false, text: "No such character or order." },
      { ok: false, text: "No such character or order." },
      { ok: false, text: "No such character or order." },
    ]);
    expect(store.accountIdByCharacterName).toHaveBeenCalledTimes(1);
  });

  it("force-credits a refused order into the buyer's live session and answers the operator", async () => {
    const operatorSession = makeSession(0, OTHER_ACCOUNT_ID);
    const buyer = makeSession(5);
    const store = makeStore({
      operatorCredit: vi.fn(async () => credited(100, 105)),
    });
    const service = new PixOrderService(
      makeRegistry({
        [ACCOUNT_ID]: buyer,
        [OTHER_ACCOUNT_ID]: operatorSession,
      }),
      store,
      makeProvider(),
    );
    const { lines, reply } = replies();
    service.credit(operatorSession, OPERATOR, ORDER_ID, reply);
    await flush(service);
    expect(store.operatorCredit).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      operatorCharacterId: OPERATOR,
    });
    expect(buyer.account?.mantusCoins).toBe(105);
    expect(buyer.sent).toContainEqual(
      expect.objectContaining({ type: "coin-order-completed", coins: 100 }),
    );
    expect(lines).toEqual([
      { ok: true, text: "Credited 100 coins; balance 105." },
    ]);
    expect(logLines(logWarn)).toContainEqual(
      `pix.operator-credit operatorCharacterId=${OPERATOR} orderId=${ORDER_ID} result=credited coins=100`,
    );
  });

  it("refuses to force-credit anything but a refused order, and validates the id first", async () => {
    const session = makeSession();
    const store = makeStore({
      operatorCredit: vi.fn(async () => ({
        status: "not-refused" as const,
        orderId: ORDER_ID,
        orderStatus: "credited" as const,
      })),
    });
    const service = new PixOrderService(
      registryOf(session),
      store,
      makeProvider(),
    );
    const { lines, reply } = replies();
    service.credit(session, OPERATOR, "not-an-id", reply);
    service.credit(session, OPERATOR, ORDER_ID, reply);
    await flush(service);
    expect(store.operatorCredit).toHaveBeenCalledTimes(1);
    expect(lines).toEqual([
      { ok: false, text: "Usage: /pixcredit <orderId>" },
      {
        ok: false,
        text: "Order is credited, only refused orders can be credited.",
      },
    ]);
  });

  it("refunds at the provider under an idempotent key, then claws back and audits the operator", async () => {
    const operatorSession = makeSession(0, OTHER_ACCOUNT_ID);
    const buyer = makeSession(100);
    const store = makeStore({
      orderById: vi.fn(async () => makeOrder({ status: "credited" })),
      markRefunded: vi.fn(async () => ({
        status: "refunded" as const,
        orderId: ORDER_ID,
        accountId: ACCOUNT_ID,
        coinsDebited: 100,
        balance: 0,
        complete: true,
      })),
    });
    const provider = makeProvider();
    const service = new PixOrderService(
      makeRegistry({
        [ACCOUNT_ID]: buyer,
        [OTHER_ACCOUNT_ID]: operatorSession,
      }),
      store,
      provider,
    );
    const { lines, reply } = replies();
    service.refund(operatorSession, OPERATOR, ORDER_ID, reply);
    await flush(service);
    expect(provider.refundPayment).toHaveBeenCalledWith(
      PAYMENT_ID,
      `pix-operator-refund:${ORDER_ID}`,
    );
    expect(store.markRefunded).toHaveBeenCalledWith({
      providerPaymentId: PAYMENT_ID,
      externalReference: null,
      refundedCentavos: null,
      snapshot: { source: "operator-refund" },
      operatorCharacterId: OPERATOR,
    });
    expect(buyer.account?.mantusCoins).toBe(0);
    expect(lines).toEqual([
      { ok: true, text: "Refunded at the provider; clawed back 100 coins." },
    ]);
  });

  it("does not touch the ledger when the provider refuses the refund", async () => {
    const session = makeSession();
    const store = makeStore({
      orderById: vi.fn(async () => makeOrder({ status: "credited" })),
    });
    const provider = makeProvider({ refundPayment: vi.fn(async () => false) });
    const service = new PixOrderService(registryOf(session), store, provider);
    const { lines, reply } = replies();
    service.refund(session, OPERATOR, ORDER_ID, reply);
    await flush(service);
    expect(store.markRefunded).not.toHaveBeenCalled();
    expect(lines).toEqual([
      { ok: false, text: "The provider refused the refund." },
    ]);
    expect(
      logLines(logError).some(
        (line) =>
          line.startsWith("pix.operator-refund") &&
          line.includes("providerAccepted=false"),
      ),
    ).toBe(true);
  });

  it("refuses to refund orders that carry no money", async () => {
    const session = makeSession();
    const provider = makeProvider();
    for (const [order, text] of [
      [null, "No such paid order."],
      [makeOrder({ providerPaymentId: null }), "No such paid order."],
      [makeOrder({ status: "refunded" }), "Order is already refunded."],
      [
        makeOrder({ status: "pending" }),
        "Order is pending; nothing to refund.",
      ],
      [
        makeOrder({ status: "cancelled" }),
        "Order is cancelled; nothing to refund.",
      ],
    ] as const) {
      const store = makeStore({ orderById: vi.fn(async () => order) });
      const service = new PixOrderService(registryOf(session), store, provider);
      const { lines, reply } = replies();
      service.refund(session, OPERATOR, ORDER_ID, reply);
      await flush(service);
      expect(lines).toEqual([{ ok: false, text }]);
    }
    expect(provider.refundPayment).not.toHaveBeenCalled();
  });

  it("answers only the operator's own live session", async () => {
    const stale = makeSession();
    const fresh = makeSession();
    const registry = makeRegistry({ [ACCOUNT_ID]: stale });
    const store = makeStore({ orderById: vi.fn(async () => makeOrder()) });
    const service = new PixOrderService(registry, store, makeProvider());
    const { lines, reply } = replies();
    service.inspect(stale, OPERATOR, ORDER_ID, reply);
    (
      registry as unknown as {
        sessionForAccount: (id: string) => Session | undefined;
      }
    ).sessionForAccount = (id: string) =>
      id === ACCOUNT_ID ? fresh : undefined;
    await flush(service);
    expect(lines).toEqual([]);
  });
});
