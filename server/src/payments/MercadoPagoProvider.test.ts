import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoProvider } from "./MercadoPagoProvider";

const TOKEN = "APP_USR-super-secret-token";
const ORDER_ID = "00000000-0000-4000-8000-00000000000a";

type FetchCall = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(
  respond: (call: FetchCall) => Response | Promise<Response>,
): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, init };
      calls.push(call);
      return respond(call);
    }),
  );
  return calls;
}

function headersOf(call: FetchCall): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

const chargeInput = {
  orderId: ORDER_ID,
  amountCentavos: 2_550,
  description: "Mantus Coins x255",
  payerEmail: "buyer@example.com",
  expiresAt: new Date("2026-08-30T12:00:00.000Z"),
};

const chargeResponse = {
  id: 123456789,
  status: "pending",
  point_of_interaction: {
    transaction_data: {
      qr_code: "00020126brcode6304ABCD",
      qr_code_base64: "AAAA",
    },
  },
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MercadoPagoProvider.createCharge", () => {
  it("posts a pix charge pinned to the order: amount, reference, expiry and idempotency key", async () => {
    const calls = stubFetch(() => jsonResponse(chargeResponse));
    const provider = new MercadoPagoProvider(TOKEN, "https://mantus.app/hook");
    const charge = await provider.createCharge(chargeInput);
    expect(charge).toEqual({
      providerPaymentId: "123456789",
      brcode: "00020126brcode6304ABCD",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.mercadopago.com/v1/payments");
    expect(calls[0]!.init.method).toBe("POST");
    expect(headersOf(calls[0]!)).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": ORDER_ID,
    });
    expect(bodyOf(calls[0]!)).toEqual({
      transaction_amount: 25.5,
      description: "Mantus Coins x255",
      payment_method_id: "pix",
      external_reference: ORDER_ID,
      date_of_expiration: "2026-08-30T12:00:00.000+00:00",
      payer: { email: "buyer@example.com" },
      notification_url: "https://mantus.app/hook",
    });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits the notification url when none is configured", async () => {
    const calls = stubFetch(() => jsonResponse(chargeResponse));
    await new MercadoPagoProvider(TOKEN).createCharge(chargeInput);
    expect(bodyOf(calls[0]!)).not.toHaveProperty("notification_url");
  });

  it("converts whole-real amounts without float noise", async () => {
    const calls = stubFetch(() => jsonResponse(chargeResponse));
    const provider = new MercadoPagoProvider(TOKEN);
    await provider.createCharge({ ...chargeInput, amountCentavos: 100_000 });
    await provider.createCharge({ ...chargeInput, amountCentavos: 1_000 });
    await provider.createCharge({ ...chargeInput, amountCentavos: 1 });
    expect(bodyOf(calls[0]!).transaction_amount).toBe(1000);
    expect(bodyOf(calls[1]!).transaction_amount).toBe(10);
    expect(bodyOf(calls[2]!).transaction_amount).toBe(0.01);
  });

  it("refuses to create a charge for a non-positive or non-integer amount", async () => {
    const calls = stubFetch(() => jsonResponse(chargeResponse));
    const provider = new MercadoPagoProvider(TOKEN);
    for (const amountCentavos of [
      0,
      -1,
      10.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2 ** 53,
    ]) {
      await expect(
        provider.createCharge({ ...chargeInput, amountCentavos }),
      ).rejects.toThrow("invalid centavos amount");
    }
    expect(calls).toHaveLength(0);
  });

  it("rejects a charge response without a usable payment id or qr code", async () => {
    const provider = new MercadoPagoProvider(TOKEN);
    for (const body of [
      {},
      { id: 1 },
      {
        id: "abc",
        point_of_interaction: { transaction_data: { qr_code: "x" } },
      },
      {
        id: "1; DROP TABLE",
        point_of_interaction: { transaction_data: { qr_code: "x" } },
      },
      { id: 1.5, point_of_interaction: { transaction_data: { qr_code: "x" } } },
      { id: 1, point_of_interaction: { transaction_data: { qr_code: "" } } },
      { id: 1, point_of_interaction: { transaction_data: { qr_code: 42 } } },
      { id: 1, point_of_interaction: null },
      null,
      "string",
    ]) {
      stubFetch(() => jsonResponse(body));
      await expect(provider.createCharge(chargeInput)).rejects.toThrow(
        "mercadopago charge response missing id or qr_code",
      );
    }
  });

  it("accepts a numeric-string payment id", async () => {
    stubFetch(() => jsonResponse({ ...chargeResponse, id: "987" }));
    const charge = await new MercadoPagoProvider(TOKEN).createCharge(
      chargeInput,
    );
    expect(charge.providerPaymentId).toBe("987");
  });

  it("surfaces an http failure by status only, never leaking the token or the response body", async () => {
    stubFetch(() =>
      jsonResponse({ message: `bad token ${TOKEN}`, cause: [] }, 401),
    );
    let caught: unknown;
    try {
      await new MercadoPagoProvider(TOKEN).createCharge(chargeInput);
    } catch (cause) {
      caught = cause;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toBe("mercadopago POST /v1/payments failed: 401");
    expect(message).not.toContain(TOKEN);
    expect(message).not.toContain("bad token");
  });

  it("rejects a non-json 200 response", async () => {
    stubFetch(() => new Response("<html>", { status: 200 }));
    await expect(
      new MercadoPagoProvider(TOKEN).createCharge(chargeInput),
    ).rejects.toThrow();
  });

  it("propagates a network failure", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(
      new MercadoPagoProvider(TOKEN).createCharge(chargeInput),
    ).rejects.toThrow("fetch failed");
  });
});

describe("MercadoPagoProvider.getPayment", () => {
  it("fetches by id with the bearer token and maps amount, currency and reference", async () => {
    const calls = stubFetch(() =>
      jsonResponse({
        id: 123456789,
        status: "approved",
        status_detail: "accredited",
        transaction_amount: 25.5,
        currency_id: "BRL",
        external_reference: ORDER_ID,
        payer: {
          email: "buyer@example.com",
          identification: { number: "12345678900" },
        },
        card: { last_four_digits: "1234" },
        date_approved: "2026-08-30T12:00:00.000-04:00",
      }),
    );
    const status = await new MercadoPagoProvider(TOKEN).getPayment("123456789");
    expect(calls[0]!.url).toBe(
      "https://api.mercadopago.com/v1/payments/123456789",
    );
    expect(calls[0]!.init.method).toBe("GET");
    expect(headersOf(calls[0]!)).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(calls[0]!.init.body).toBeUndefined();
    expect(status).toEqual({
      status: "approved",
      amountCentavos: 2_550,
      refundedCentavos: null,
      currency: "BRL",
      externalReference: ORDER_ID,
      snapshot: {
        id: 123456789,
        status: "approved",
        status_detail: "accredited",
        transaction_amount: 25.5,
        currency_id: "BRL",
        external_reference: ORDER_ID,
        date_approved: "2026-08-30T12:00:00.000-04:00",
      },
    });
  });

  it("never carries payer or card data in the snapshot", async () => {
    stubFetch(() =>
      jsonResponse({
        id: 1,
        status: "approved",
        payer: { email: "x@y.z" },
        card: {},
        additional_info: { ip_address: "1.2.3.4" },
        metadata: { anything: true },
      }),
    );
    const status = await new MercadoPagoProvider(TOKEN).getPayment("1");
    expect(Object.keys(status.snapshot)).toEqual(["id", "status"]);
  });

  it("rounds fractional amounts to centavos", async () => {
    for (const [amount, centavos] of [
      [10, 1_000],
      [0.1, 10],
      [10.005, 1_001],
      [1000, 100_000],
      [19.99, 1_999],
    ] as const) {
      stubFetch(() =>
        jsonResponse({ id: 1, status: "approved", transaction_amount: amount }),
      );
      const status = await new MercadoPagoProvider(TOKEN).getPayment("1");
      expect(status.amountCentavos).toBe(centavos);
    }
  });

  it("reports null amount, currency and reference when the provider sends garbage for them", async () => {
    for (const body of [
      { id: 1, status: "approved" },
      {
        id: 1,
        status: "approved",
        transaction_amount: "10",
        currency_id: 5,
        external_reference: 7,
      },
      { id: 1, status: "approved", transaction_amount: Number.NaN },
      {
        id: 1,
        status: "approved",
        transaction_amount: null,
        currency_id: null,
        external_reference: null,
      },
    ]) {
      stubFetch(() => jsonResponse(body));
      const status = await new MercadoPagoProvider(TOKEN).getPayment("1");
      expect(status.amountCentavos).toBeNull();
      expect(status.currency).toBeNull();
      expect(status.externalReference).toBeNull();
    }
  });

  it("maps every provider status onto the five we act on", async () => {
    const provider = new MercadoPagoProvider(TOKEN);
    const expectations: Array<[unknown, string]> = [
      ["approved", "approved"],
      ["pending", "pending"],
      ["in_process", "pending"],
      ["authorized", "pending"],
      ["cancelled", "cancelled"],
      ["rejected", "cancelled"],
      ["expired", "cancelled"],
      ["refunded", "refunded"],
      ["charged_back", "refunded"],
      ["in_mediation", "unknown"],
      ["APPROVED", "unknown"],
      [undefined, "unknown"],
      [1, "unknown"],
      [{ toString: () => "approved" }, "unknown"],
    ];
    for (const [reported, expected] of expectations) {
      stubFetch(() => jsonResponse({ id: 1, status: reported }));
      expect((await provider.getPayment("1")).status).toBe(expected);
    }
  });

  it("refuses to fetch anything but a numeric payment id (no path injection)", async () => {
    const calls = stubFetch(() => jsonResponse({}));
    const provider = new MercadoPagoProvider(TOKEN);
    for (const id of [
      "",
      "abc",
      "1/../search",
      "1?access_token=x",
      "1 ",
      "-1",
      "1.0",
      "9".repeat(33),
    ]) {
      await expect(provider.getPayment(id)).rejects.toThrow(
        "invalid mercadopago payment id",
      );
    }
    expect(calls).toHaveLength(0);
  });

  it("throws on an http failure with only the status", async () => {
    stubFetch(() => jsonResponse({ message: "not found" }, 404));
    await expect(
      new MercadoPagoProvider(TOKEN).getPayment("1"),
    ).rejects.toThrow("mercadopago GET /v1/payments failed: 404");
  });
});

describe("MercadoPagoProvider.cancelPayment", () => {
  it("puts status=cancelled and reports success only when the provider confirms it", async () => {
    const calls = stubFetch(() => jsonResponse({ id: 1, status: "cancelled" }));
    expect(await new MercadoPagoProvider(TOKEN).cancelPayment("1")).toBe(true);
    expect(calls[0]!.url).toBe("https://api.mercadopago.com/v1/payments/1");
    expect(calls[0]!.init.method).toBe("PUT");
    expect(bodyOf(calls[0]!)).toEqual({ status: "cancelled" });
    expect(headersOf(calls[0]!)).not.toHaveProperty("X-Idempotency-Key");
  });

  it("reports failure when the provider answers with another status (already paid)", async () => {
    stubFetch(() => jsonResponse({ id: 1, status: "approved" }));
    expect(await new MercadoPagoProvider(TOKEN).cancelPayment("1")).toBe(false);
  });

  it("reports failure instead of throwing on an http error or network failure", async () => {
    stubFetch(() =>
      jsonResponse({ message: "Payment is already approved" }, 400),
    );
    expect(await new MercadoPagoProvider(TOKEN).cancelPayment("1")).toBe(false);
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await new MercadoPagoProvider(TOKEN).cancelPayment("1")).toBe(false);
  });

  it("refuses to cancel anything but a numeric payment id", async () => {
    const calls = stubFetch(() => jsonResponse({ id: 1, status: "cancelled" }));
    await expect(
      new MercadoPagoProvider(TOKEN).cancelPayment("1/../2"),
    ).rejects.toThrow("invalid mercadopago payment id");
    expect(calls).toHaveLength(0);
  });
});

describe("MercadoPagoProvider: refunds", () => {
  it("maps the cumulative refunded amount to centavos", async () => {
    stubFetch(() =>
      jsonResponse({
        id: 1,
        status: "approved",
        transaction_amount: 10,
        transaction_amount_refunded: 3.5,
      }),
    );
    const status = await new MercadoPagoProvider(TOKEN).getPayment("1");
    expect(status.refundedCentavos).toBe(350);
    stubFetch(() =>
      jsonResponse({
        id: 1,
        status: "approved",
        transaction_amount_refunded: "3.5",
      }),
    );
    expect(
      (await new MercadoPagoProvider(TOKEN).getPayment("1")).refundedCentavos,
    ).toBeNull();
  });

  it("posts a full refund under the given idempotency key and trusts only a confirmed status", async () => {
    const calls = stubFetch(() => jsonResponse({ id: 77, status: "approved" }));
    const ok = await new MercadoPagoProvider(TOKEN).refundPayment(
      "123",
      "pix-operator-refund:abc",
    );
    expect(ok).toBe(true);
    expect(calls[0]!.url).toBe(
      "https://api.mercadopago.com/v1/payments/123/refunds",
    );
    expect(calls[0]!.init.method).toBe("POST");
    expect(bodyOf(calls[0]!)).toEqual({});
    expect(headersOf(calls[0]!)["X-Idempotency-Key"]).toBe(
      "pix-operator-refund:abc",
    );
    stubFetch(() => jsonResponse({ id: 78, status: "in_process" }));
    expect(await new MercadoPagoProvider(TOKEN).refundPayment("123", "k")).toBe(
      true,
    );
    stubFetch(() => jsonResponse({ id: 79, status: "rejected" }));
    expect(await new MercadoPagoProvider(TOKEN).refundPayment("123", "k")).toBe(
      false,
    );
    stubFetch(() => jsonResponse({ message: "already refunded" }, 400));
    expect(await new MercadoPagoProvider(TOKEN).refundPayment("123", "k")).toBe(
      false,
    );
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await new MercadoPagoProvider(TOKEN).refundPayment("123", "k")).toBe(
      false,
    );
  });

  it("refuses a refund for a non-numeric payment id or a malformed idempotency key", async () => {
    const calls = stubFetch(() => jsonResponse({ id: 1, status: "approved" }));
    const provider = new MercadoPagoProvider(TOKEN);
    await expect(provider.refundPayment("1/../2", "k")).rejects.toThrow(
      "invalid mercadopago payment id",
    );
    await expect(
      provider.refundPayment("1", "bad key with spaces"),
    ).rejects.toThrow("invalid refund idempotency key");
    await expect(provider.refundPayment("1", "")).rejects.toThrow(
      "invalid refund idempotency key",
    );
    expect(calls).toHaveLength(0);
  });
});
