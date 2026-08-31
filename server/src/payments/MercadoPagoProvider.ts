import type { PixCharge, PixPaymentStatus, PixProvider } from "./PixProvider";

const API_BASE = "https://api.mercadopago.com";
const REQUEST_TIMEOUT_MS = 10_000;

export class MercadoPagoProvider implements PixProvider {
  constructor(
    private readonly accessToken: string,
    private readonly notificationUrl?: string,
  ) {}

  async createCharge(input: {
    readonly orderId: string;
    readonly amountCentavos: number;
    readonly description: string;
    readonly payerEmail: string;
    readonly expiresAt: Date;
  }): Promise<PixCharge> {
    const body: Record<string, unknown> = {
      transaction_amount: centavosToReais(input.amountCentavos),
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.orderId,
      date_of_expiration: expirationStamp(input.expiresAt),
      payer: { email: input.payerEmail },
    };
    if (this.notificationUrl) body.notification_url = this.notificationUrl;
    const payment = asRecord(
      await this.request("POST", "/v1/payments", body, input.orderId),
    );
    const providerPaymentId = paymentIdOf(payment);
    const interaction = asRecord(payment.point_of_interaction);
    const transactionData = asRecord(interaction.transaction_data);
    const brcode = transactionData.qr_code;
    if (!providerPaymentId || typeof brcode !== "string" || brcode.length === 0) {
      throw new Error("mercadopago charge response missing id or qr_code");
    }
    return { providerPaymentId, brcode };
  }

  async getPayment(providerPaymentId: string): Promise<PixPaymentStatus> {
    assertPaymentId(providerPaymentId);
    const payment = asRecord(
      await this.request("GET", `/v1/payments/${providerPaymentId}`),
    );
    const amount = payment.transaction_amount;
    const reference = payment.external_reference;
    return {
      status: normalizeStatus(payment.status),
      amountCentavos:
        typeof amount === "number" && Number.isFinite(amount)
          ? Math.round(amount * 100)
          : null,
      externalReference: typeof reference === "string" ? reference : null,
      snapshot: snapshotOf(payment),
    };
  }

  async cancelPayment(providerPaymentId: string): Promise<boolean> {
    assertPaymentId(providerPaymentId);
    try {
      const payment = asRecord(
        await this.request("PUT", `/v1/payments/${providerPaymentId}`, {
          status: "cancelled",
        }),
      );
      return payment.status === "cancelled";
    } catch {
      return false;
    }
  }

  private async request(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey !== undefined) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `mercadopago ${method} ${path.split("/").slice(0, 3).join("/")} ` +
          `failed: ${response.status}`,
      );
    }
    return (await response.json()) as unknown;
  }
}

function centavosToReais(centavos: number): number {
  if (!Number.isSafeInteger(centavos) || centavos < 1) {
    throw new Error("invalid centavos amount");
  }
  return centavos / 100;
}

function expirationStamp(date: Date): string {
  return date.toISOString().replace("Z", "+00:00");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function paymentIdOf(payment: Record<string, unknown>): string | null {
  const id = payment.id;
  if (typeof id === "number" && Number.isSafeInteger(id)) return String(id);
  if (typeof id === "string" && /^\d{1,32}$/.test(id)) return id;
  return null;
}

function snapshotOf(payment: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const key of [
    "id",
    "status",
    "status_detail",
    "transaction_amount",
    "transaction_amount_refunded",
    "currency_id",
    "date_created",
    "date_approved",
    "date_last_updated",
    "external_reference",
    "payment_method_id",
  ]) {
    if (payment[key] !== undefined) kept[key] = payment[key];
  }
  return kept;
}

function assertPaymentId(providerPaymentId: string): void {
  if (!/^\d{1,32}$/.test(providerPaymentId)) {
    throw new Error("invalid mercadopago payment id");
  }
}

function normalizeStatus(status: unknown): PixPaymentStatus["status"] {
  if (status === "approved") return "approved";
  if (
    status === "pending" ||
    status === "in_process" ||
    status === "authorized"
  ) {
    return "pending";
  }
  if (status === "cancelled" || status === "rejected" || status === "expired") {
    return "cancelled";
  }
  if (status === "refunded" || status === "charged_back") return "refunded";
  return "unknown";
}
