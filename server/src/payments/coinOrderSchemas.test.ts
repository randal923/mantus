import { describe, expect, it } from "vitest";
import {
  COIN_ORDER_LIMITS,
  STORE_LIMITS,
  clientMessageSchema,
  coinOrderCancelMessageSchema,
  coinOrderCompletedMessageSchema,
  coinOrderCreateMessageSchema,
  coinOrderFailedMessageSchema,
  coinOrderOpenMessageSchema,
  coinOrderStateMessageSchema,
  serverMessageSchema,
} from "@tibia/protocol";
import { PIX_COIN_PACKAGES } from "./PIX_COIN_PACKAGES";

const ORDER_ID = "00000000-0000-4000-8000-00000000000a";

describe("coin order wire schemas: client → server", () => {
  it("accepts exactly the three intents and routes them through the client union", () => {
    expect(
      clientMessageSchema.safeParse({ type: "coin-order-open" }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "coin-order-create",
        packageId: "coins-100",
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "coin-order-cancel",
        orderId: ORDER_ID,
      }).success,
    ).toBe(true);
  });

  it("carries no price, coin count or account on the create intent (strict)", () => {
    for (const extra of [
      { coins: 1_000_000 },
      { amountCentavos: 1 },
      { accountId: ORDER_ID },
      { price: 0 },
      { brcode: "x" },
    ]) {
      const result = coinOrderCreateMessageSchema.safeParse({
        type: "coin-order-create",
        packageId: "coins-100",
        ...extra,
      });
      expect(result.success).toBe(false);
    }
  });

  it("bounds the package id", () => {
    expect(
      coinOrderCreateMessageSchema.safeParse({
        type: "coin-order-create",
        packageId: "",
      }).success,
    ).toBe(false);
    expect(
      coinOrderCreateMessageSchema.safeParse({
        type: "coin-order-create",
        packageId: "x".repeat(65),
      }).success,
    ).toBe(false);
    expect(
      coinOrderCreateMessageSchema.safeParse({
        type: "coin-order-create",
        packageId: "x".repeat(64),
      }).success,
    ).toBe(true);
    for (const packageId of [null, undefined, 1, {}, [], true]) {
      expect(
        coinOrderCreateMessageSchema.safeParse({
          type: "coin-order-create",
          packageId,
        }).success,
      ).toBe(false);
    }
  });

  it("requires a uuid order id on cancel", () => {
    for (const orderId of [
      "",
      "1",
      "not-a-uuid",
      `${ORDER_ID}x`,
      ORDER_ID.toUpperCase().slice(0, 35),
      123,
      null,
    ]) {
      expect(
        coinOrderCancelMessageSchema.safeParse({
          type: "coin-order-cancel",
          orderId,
        }).success,
      ).toBe(false);
    }
    expect(
      coinOrderCancelMessageSchema.safeParse({
        type: "coin-order-cancel",
        orderId: ORDER_ID,
      }).success,
    ).toBe(true);
    expect(
      coinOrderCancelMessageSchema.safeParse({
        type: "coin-order-cancel",
        orderId: ORDER_ID,
        accountId: ORDER_ID,
      }).success,
    ).toBe(false);
  });

  it("rejects extra fields on open", () => {
    expect(
      coinOrderOpenMessageSchema.safeParse({
        type: "coin-order-open",
        packageId: "x",
      }).success,
    ).toBe(false);
  });
});

describe("coin order wire schemas: server → client", () => {
  const order = {
    id: ORDER_ID,
    packageId: "coins-100",
    coins: 100,
    amountCentavos: 1_000,
    brcode: "00020126brcode6304ABCD",
    expiresAt: "2026-08-30T12:00:00.000Z",
  };

  it("the server catalog itself is wire-valid", () => {
    const result = coinOrderStateMessageSchema.safeParse({
      type: "coin-order-state",
      packages: PIX_COIN_PACKAGES,
      order,
    });
    expect(result.success).toBe(true);
    expect(PIX_COIN_PACKAGES.length).toBeLessThanOrEqual(
      COIN_ORDER_LIMITS.maxPackages,
    );
    expect(
      serverMessageSchema.safeParse({
        type: "coin-order-state",
        packages: PIX_COIN_PACKAGES,
        order: null,
      }).success,
    ).toBe(true);
  });

  it("never lets internal fields leak on the order (strict)", () => {
    for (const leak of [
      { accountId: ORDER_ID },
      { providerPaymentId: "123" },
      { status: "pending" },
      { characterId: ORDER_ID },
    ]) {
      expect(
        coinOrderStateMessageSchema.safeParse({
          type: "coin-order-state",
          packages: PIX_COIN_PACKAGES,
          order: { ...order, ...leak },
        }).success,
      ).toBe(false);
    }
  });

  it("bounds package and order amounts and the brcode length", () => {
    const state = (patch: Partial<typeof order>) =>
      coinOrderStateMessageSchema.safeParse({
        type: "coin-order-state",
        packages: [],
        order: { ...order, ...patch },
      }).success;
    expect(state({ coins: 0 })).toBe(false);
    expect(state({ coins: COIN_ORDER_LIMITS.maxCoinsPerPackage + 1 })).toBe(
      false,
    );
    expect(state({ coins: 10.5 })).toBe(false);
    expect(state({ amountCentavos: 0 })).toBe(false);
    expect(
      state({ amountCentavos: COIN_ORDER_LIMITS.maxAmountCentavos + 1 }),
    ).toBe(false);
    expect(state({ brcode: "" })).toBe(false);
    expect(
      state({ brcode: "x".repeat(COIN_ORDER_LIMITS.maxBrcodeLength + 1) }),
    ).toBe(false);
    expect(state({ expiresAt: "tomorrow" })).toBe(false);
    expect(state({ id: "1" })).toBe(false);
    expect(
      coinOrderStateMessageSchema.safeParse({
        type: "coin-order-state",
        packages: Array.from(
          { length: COIN_ORDER_LIMITS.maxPackages + 1 },
          (_, index) => ({
            id: `p${index}`,
            coins: 1,
            amountCentavos: 1,
          }),
        ),
        order: null,
      }).success,
    ).toBe(false);
  });

  it("bounds the completed balance to the store cap and the failure reason to the enum", () => {
    const completed = (patch: Record<string, unknown>) =>
      coinOrderCompletedMessageSchema.safeParse({
        type: "coin-order-completed",
        orderId: ORDER_ID,
        coins: 100,
        balance: 100,
        ...patch,
      }).success;
    expect(completed({})).toBe(true);
    expect(completed({ balance: -1 })).toBe(false);
    expect(completed({ balance: STORE_LIMITS.maxBalance + 1 })).toBe(false);
    expect(completed({ balance: STORE_LIMITS.maxBalance })).toBe(true);
    expect(completed({ coins: 0 })).toBe(false);
    expect(completed({ providerPaymentId: "1" })).toBe(false);
    for (const reason of [
      "pending-order-exists",
      "package-not-found",
      "order-not-found",
      "cancel-failed",
      "rate-limited",
      "unavailable",
      "failed",
    ]) {
      expect(
        coinOrderFailedMessageSchema.safeParse({
          type: "coin-order-failed",
          reason,
        }).success,
      ).toBe(true);
    }
    expect(
      coinOrderFailedMessageSchema.safeParse({
        type: "coin-order-failed",
        reason: "db: connection refused",
      }).success,
    ).toBe(false);
    expect(
      coinOrderFailedMessageSchema.safeParse({
        type: "coin-order-failed",
        reason: "failed",
        detail: "x",
      }).success,
    ).toBe(false);
  });
});
