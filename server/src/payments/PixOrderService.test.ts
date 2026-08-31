import { describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { PIX_COIN_PACKAGES_BY_ID } from "./PIX_COIN_PACKAGES";
import type { PixOrderRecord, PixOrderStore } from "./PixOrderStore";
import { PixOrderService } from "./PixOrderService";
import type { PixProvider } from "./PixProvider";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const CHARACTER_ID = "00000000-0000-4000-8000-000000000002";
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
    providerPaymentId: PAYMENT_ID,
    brcode: "00020126pixpayload6304ABCD",
    status: "pending",
    expiresAt: new Date(Date.now() + 60 * 60_000),
    ...overrides,
  };
}

function makeSession(coins = 50): Session & { sent: ServerMessage[] } {
  const sent: ServerMessage[] = [];
  return {
    sent,
    playerId: CHARACTER_ID,
    account: {
      id: ACCOUNT_ID,
      email: "buyer@example.com",
      mantusCoins: coins,
    },
    send: (message: ServerMessage) => {
      sent.push(message);
    },
  } as unknown as Session & { sent: ServerMessage[] };
}

function makeRegistry(session: Session): SessionRegistry {
  return {
    sessionForAccount: (accountId: string) =>
      accountId === ACCOUNT_ID ? session : undefined,
  } as unknown as SessionRegistry;
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
    openOrderFor: vi.fn(async () => null),
    cancelOrder: vi.fn(async () => "cancelled" as const),
    settleApproved: vi.fn(async () => ({
      status: "not-found" as const,
    })),
    markRefunded: vi.fn(async () => ({ status: "not-found" as const })),
    markProviderCancelled: vi.fn(async () => null),
    expireStale: vi.fn(async () => []),
    openForReconciliation: vi.fn(async () => []),
    ...overrides,
  };
}

function makeProvider(overrides: Partial<PixProvider> = {}): PixProvider {
  return {
    createCharge: vi.fn(async () => ({
      providerPaymentId: PAYMENT_ID,
      brcode: "00020126pixpayload6304ABCD",
    })),
    getPayment: vi.fn(async () => ({
      status: "pending" as const,
      amountCentavos: 1_000,
      externalReference: ORDER_ID,
      snapshot: {},
    })),
    cancelPayment: vi.fn(async () => true),
    ...overrides,
  };
}

async function flush(service: PixOrderService): Promise<void> {
  await service.stop();
  service.applyResolvedOutcomes();
}

describe("PixOrderService", () => {
  it("pins price and coin amount from the server catalog, never the wire", async () => {
    const session = makeSession();
    const store = makeStore();
    const provider = makeProvider();
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
    service.handle(session, { type: "coin-order-create", packageId: "coins-2500" }, 10_000);
    await flush(service);
    const pack = PIX_COIN_PACKAGES_BY_ID.get("coins-2500")!;
    expect(store.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        packageId: pack.id,
        coins: pack.coins,
        amountCentavos: pack.amountCentavos,
      }),
    );
    expect(provider.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountCentavos: pack.amountCentavos }),
    );
  });

  it("refuses an unknown package id without touching the store", async () => {
    const session = makeSession();
    const store = makeStore();
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      makeProvider(),
    );
    service.handle(
      session,
      { type: "coin-order-create", packageId: "coins-999999" },
      10_000,
    );
    await flush(service);
    expect(store.createOrder).not.toHaveBeenCalled();
    expect(session.sent).toContainEqual({
      type: "coin-order-failed",
      reason: "package-not-found",
    });
  });

  it("enforces the per-account action cooldown", async () => {
    const session = makeSession();
    const store = makeStore();
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      makeProvider(),
    );
    service.handle(session, { type: "coin-order-create", packageId: "coins-100" }, 1_000);
    service.handle(session, { type: "coin-order-create", packageId: "coins-100" }, 1_500);
    await flush(service);
    expect(store.createOrder).toHaveBeenCalledTimes(1);
    expect(session.sent).toContainEqual({
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
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
    service.handle(session, { type: "coin-order-create", packageId: "coins-100" }, 10_000);
    await flush(service);
    expect(provider.createCharge).not.toHaveBeenCalled();
    expect(session.sent).toContainEqual({
      type: "coin-order-failed",
      reason: "pending-order-exists",
    });
    const state = session.sent.find(
      (message) => message.type === "coin-order-state",
    );
    expect(state).toMatchObject({ order: { id: ORDER_ID } });
  });

  it("resumes an interrupted checkout with the same order id", async () => {
    const session = makeSession();
    const stranded = makeOrder({ providerPaymentId: null, brcode: null });
    const store = makeStore({
      createOrder: vi.fn(async () => ({
        status: "pending-order-exists" as const,
        order: stranded,
      })),
    });
    const provider = makeProvider();
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
    service.handle(session, { type: "coin-order-create", packageId: "coins-100" }, 10_000);
    await flush(service);
    expect(provider.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: stranded.id }),
    );
    expect(store.attachCharge).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: stranded.id }),
    );
  });

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
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
    service.handle(session, { type: "coin-order-cancel", orderId: ORDER_ID }, 10_000);
    await flush(service);
    expect(calls).toEqual(["provider", "store"]);
    expect(session.sent).toContainEqual(
      expect.objectContaining({ type: "coin-order-state", order: null }),
    );
  });

  it("keeps the order alive when the provider refuses the cancel (paid race)", async () => {
    const session = makeSession();
    const order = makeOrder();
    const store = makeStore({
      openOrderFor: vi.fn(async () => order),
      settleApproved: vi.fn(async () => ({
        status: "credited" as const,
        orderId: ORDER_ID,
        accountId: ACCOUNT_ID,
        characterId: CHARACTER_ID,
        coins: 100,
        balance: 150,
      })),
    });
    const provider = makeProvider({
      cancelPayment: vi.fn(async () => false),
      getPayment: vi.fn(async () => ({
        status: "approved" as const,
        amountCentavos: 1_000,
        externalReference: ORDER_ID,
        snapshot: {},
      })),
    });
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
    service.handle(session, { type: "coin-order-cancel", orderId: ORDER_ID }, 10_000);
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
  });

  it("refuses to cancel an order id that is not the open order", async () => {
    const session = makeSession();
    const store = makeStore({
      openOrderFor: vi.fn(async () => makeOrder()),
    });
    const provider = makeProvider();
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
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

  it("credits a settled payment relatively into the live session", async () => {
    const session = makeSession(50);
    const store = makeStore({
      settleApproved: vi.fn(async () => ({
        status: "credited" as const,
        orderId: ORDER_ID,
        accountId: ACCOUNT_ID,
        characterId: CHARACTER_ID,
        coins: 100,
        balance: 9_999,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => ({
        status: "approved" as const,
        amountCentavos: 1_000,
        externalReference: ORDER_ID,
        snapshot: {},
      })),
    });
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
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

  it("never credits on an amount mismatch", async () => {
    const session = makeSession(50);
    const store = makeStore({
      settleApproved: vi.fn(async () => ({
        status: "amount-mismatch" as const,
        orderId: ORDER_ID,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => ({
        status: "approved" as const,
        amountCentavos: 1,
        externalReference: ORDER_ID,
        snapshot: {},
      })),
    });
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(50);
    expect(session.sent).toEqual([]);
  });

  it("claws back a refunded payment, clamped at zero", async () => {
    const session = makeSession(30);
    const store = makeStore({
      markRefunded: vi.fn(async () => ({
        status: "refunded" as const,
        orderId: ORDER_ID,
        accountId: ACCOUNT_ID,
        coinsDebited: 100,
        balance: 0,
      })),
    });
    const provider = makeProvider({
      getPayment: vi.fn(async () => ({
        status: "refunded" as const,
        amountCentavos: 1_000,
        externalReference: ORDER_ID,
        snapshot: {},
      })),
    });
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
    service.notify(PAYMENT_ID);
    await flush(service);
    expect(session.account?.mantusCoins).toBe(0);
  });

  it("only ever credits through settle, even for unknown payments", async () => {
    const session = makeSession(50);
    const store = makeStore();
    const provider = makeProvider({
      getPayment: vi.fn(async () => ({
        status: "approved" as const,
        amountCentavos: 999_999,
        externalReference: null,
        snapshot: {},
      })),
    });
    const service = new PixOrderService(
      makeRegistry(session),
      store,
      provider,
    );
    service.notify("111222333");
    await flush(service);
    expect(session.account?.mantusCoins).toBe(50);
    expect(session.sent).toEqual([]);
  });
});
