import type { IncomingMessage, ServerResponse } from "node:http";
import { logPix } from "./logPix";
import type { PixOrderService } from "./PixOrderService";
import { verifyMercadoPagoSignature } from "./verifyMercadoPagoSignature";

const WEBHOOK_PATH = "/api/payments/mercadopago/webhook";
const MAX_BODY_BYTES = 16_384;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 60;
const RATE_MAX_GLOBAL = 600;
/** Mirrors the signature timestamp tolerance: a digest is remembered as long as it could verify. */
const REPLAY_TTL_MS = 24 * 60 * 60 * 1000;
const REPLAY_MAX_ENTRIES = 10_000;

export class PixWebhookApi {
  private readonly hitsByIp = new Map<string, number>();
  private globalHits = 0;
  private windowStartMs = 0;
  /**
   * Digests of notifications already accepted, so a captured request cannot
   * be replayed for the whole signature tolerance window. A provider retry
   * carries a fresh timestamp and therefore a fresh digest.
   */
  private readonly seenDigests = new Map<string, number>();

  constructor(
    private readonly options: {
      /** Current secret first; older ones stay valid while rotating. */
      readonly secrets: readonly string[];
      readonly service: PixOrderService;
      readonly trustProxyHeader: boolean;
    },
  ) {
    if (options.secrets.length === 0) {
      throw new Error("PixWebhookApi needs at least one secret");
    }
  }

  matches(pathname: string): boolean {
    return pathname.startsWith("/api/payments/");
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.url === undefined || request.url.length > 2_048) {
      request.resume();
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
    const ip = this.ipOf(request);
    const requestId = headerOf(request, "x-request-id")?.slice(0, 128);
    if (!this.admit(ip)) {
      request.resume();
      logPix("warn", "webhook-rate-limited", { ip, requestId });
      this.sendJson(response, 429, { error: "rate-limited" });
      return;
    }
    // The signature covers only the query id, request id and timestamp, so
    // it is checked before a single body byte is buffered: unsigned callers
    // never get to spend parse time or memory.
    const queryDataId = url.searchParams.get("data.id") ?? undefined;
    const xSignature = headerOf(request, "x-signature");
    const signatureOk = this.options.secrets.some((secret) =>
      verifyMercadoPagoSignature({
        secret,
        xSignature,
        xRequestId: headerOf(request, "x-request-id"),
        dataId: queryDataId,
      }),
    );
    if (!signatureOk) {
      request.resume();
      logPix("warn", "webhook-rejected", {
        ip,
        requestId,
        reason: "invalid-signature",
        dataId: queryDataId?.slice(0, 64),
      });
      this.sendJson(response, 401, { error: "invalid-signature" });
      return;
    }
    if (this.replayed(xSignature)) {
      request.resume();
      logPix("warn", "webhook-replayed", {
        ip,
        requestId,
        dataId: queryDataId?.slice(0, 64),
      });
      this.sendJson(response, 200, { ok: true });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(await this.readBody(request));
    } catch (cause) {
      logPix("warn", "webhook-rejected", {
        ip,
        requestId,
        reason: cause instanceof Error ? cause.message : "invalid-body",
      });
      this.sendJson(response, 400, { error: "invalid-body" });
      return;
    }
    this.sendJson(response, 200, { ok: true });

    const record = asRecord(body);
    const data = asRecord(record.data);
    const topic = record.type ?? url.searchParams.get("type");
    const paymentId = paymentIdOf(queryDataId ?? data.id);
    if (topic !== "payment" && topic !== undefined && topic !== null) {
      logPix("info", "webhook-ignored", {
        ip,
        requestId,
        reason: "topic",
        topic: typeof topic === "string" ? topic.slice(0, 64) : "non-string",
      });
      return;
    }
    if (paymentId === null) {
      logPix("warn", "webhook-ignored", {
        ip,
        requestId,
        reason: "payment-id",
      });
      return;
    }
    logPix("info", "webhook-accepted", { ip, requestId, paymentId });
    this.options.service.notify(paymentId);
  }

  private replayed(xSignature: string | undefined): boolean {
    const digest = /(?:^|,)\s*v1\s*=\s*([0-9a-f]{64})/i.exec(
      xSignature ?? "",
    )?.[1];
    if (!digest) return false;
    const key = digest.toLowerCase();
    const now = Date.now();
    const seenUntil = this.seenDigests.get(key);
    if (seenUntil !== undefined && seenUntil > now) return true;
    if (this.seenDigests.size >= REPLAY_MAX_ENTRIES) {
      for (const [entry, until] of this.seenDigests) {
        if (until <= now) this.seenDigests.delete(entry);
      }
      if (this.seenDigests.size >= REPLAY_MAX_ENTRIES) {
        const oldest = this.seenDigests.keys().next().value;
        if (oldest !== undefined) this.seenDigests.delete(oldest);
      }
    }
    this.seenDigests.set(key, now + REPLAY_TTL_MS);
    return false;
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

  /**
   * Same source as the WebSocket layer: Fly's proxy sets `fly-client-ip`
   * itself, whereas `x-forwarded-for` keeps whatever the client prepended —
   * reading that would let a flood pick its own rate-limit bucket.
   */
  private ipOf(request: IncomingMessage): string {
    if (this.options.trustProxyHeader) {
      const ip = headerOf(request, "fly-client-ip")?.trim();
      if (ip) return ip.slice(0, 64);
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
