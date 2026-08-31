import type { IncomingMessage, ServerResponse } from "node:http";
import type { PixOrderService } from "./PixOrderService";
import { verifyMercadoPagoSignature } from "./verifyMercadoPagoSignature";

const WEBHOOK_PATH = "/api/payments/mercadopago/webhook";
const MAX_BODY_BYTES = 16_384;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 60;
const RATE_MAX_GLOBAL = 600;

export class PixWebhookApi {
  private readonly hitsByIp = new Map<string, number>();
  private globalHits = 0;
  private windowStartMs = 0;

  constructor(
    private readonly options: {
      readonly secret: string;
      readonly service: PixOrderService;
      readonly trustProxyHeader: boolean;
    },
  ) {}

  matches(pathname: string): boolean {
    return pathname.startsWith("/api/payments/");
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.url === undefined || request.url.length > 2_048) {
      this.sendJson(response, 404, { error: "not-found" });
      return;
    }
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== WEBHOOK_PATH) {
      request.resume();
      this.sendJson(response, 404, { error: "not-found" });
      return;
    }
    if (request.method !== "POST") {
      request.resume();
      response.setHeader("Allow", "POST");
      this.sendJson(response, 405, { error: "method-not-allowed" });
      return;
    }
    if (!this.admit(this.ipOf(request))) {
      request.resume();
      this.sendJson(response, 429, { error: "rate-limited" });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(await this.readBody(request));
    } catch {
      this.sendJson(response, 400, { error: "invalid-body" });
      return;
    }
    const record = asRecord(body);
    const data = asRecord(record.data);
    const queryDataId = url.searchParams.get("data.id") ?? undefined;
    const signatureOk = verifyMercadoPagoSignature({
      secret: this.options.secret,
      xSignature: headerOf(request, "x-signature"),
      xRequestId: headerOf(request, "x-request-id"),
      dataId: queryDataId,
    });
    if (!signatureOk) {
      this.sendJson(response, 401, { error: "invalid-signature" });
      return;
    }
    this.sendJson(response, 200, { ok: true });

    const topic = record.type ?? url.searchParams.get("type");
    if (topic !== "payment" && topic !== undefined && topic !== null) return;
    const paymentId = paymentIdOf(queryDataId ?? data.id);
    if (paymentId === null) return;
    this.options.service.notify(paymentId);
  }

  private admit(ip: string): boolean {
    const now = Date.now();
    if (now - this.windowStartMs >= RATE_WINDOW_MS) {
      this.windowStartMs = now;
      this.globalHits = 0;
      this.hitsByIp.clear();
    }
    this.globalHits += 1;
    const hits = (this.hitsByIp.get(ip) ?? 0) + 1;
    this.hitsByIp.set(ip, hits);
    return hits <= RATE_MAX_PER_IP && this.globalHits <= RATE_MAX_GLOBAL;
  }

  private ipOf(request: IncomingMessage): string {
    if (this.options.trustProxyHeader) {
      const forwarded = headerOf(request, "x-forwarded-for");
      const first = forwarded?.split(",")[0]?.trim();
      if (first) return first.slice(0, 64);
    }
    return request.socket.remoteAddress ?? "unknown";
  }

  private readBody(request: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let received = 0;
      request.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_BODY_BYTES) {
          request.destroy();
          reject(new Error("webhook body too large"));
          return;
        }
        chunks.push(chunk);
      });
      request.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      request.on("error", reject);
    });
  }

  private sendJson(
    response: ServerResponse,
    status: number,
    payload: Record<string, unknown>,
  ): void {
    if (response.headersSent) return;
    const body = JSON.stringify(payload);
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    response.end(body);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function headerOf(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function paymentIdOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }
  if (typeof value === "string" && /^\d{1,32}$/.test(value)) return value;
  return null;
}
