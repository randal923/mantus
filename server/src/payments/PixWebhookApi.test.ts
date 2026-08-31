import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PixOrderService } from "./PixOrderService";
import { PixWebhookApi } from "./PixWebhookApi";

const SECRET = "webhook-secret";
const REQUEST_ID = "req-1";
const PATH = "/api/payments/mercadopago/webhook";

let signatureNonce = 0;

function signedHeaders(
  dataId: string,
  secret = SECRET,
): Record<string, string> {
  // Each signature carries a distinct timestamp so tests do not trip the
  // replay cache by accident; the replay test signs once and reuses.
  signatureNonce += 1;
  const ts = String(Math.floor(Date.now() / 1000) - (signatureNonce % 3_600));
  const manifest = `id:${dataId};request-id:${REQUEST_ID};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": REQUEST_ID };
}

function makeRequest(input: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
  body?: string;
  ip?: string;
}): IncomingMessage {
  const readable = Readable.from(
    input.body === undefined ? [] : [Buffer.from(input.body)],
  ) as unknown as IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string | string[]>;
  };
  readable.method = input.method ?? "POST";
  readable.url = input.url ?? PATH;
  readable.headers = input.headers ?? {};
  Object.defineProperty(readable, "socket", {
    value: { remoteAddress: input.ip ?? "203.0.113.5" },
  });
  return readable;
}

function makeResponse(): ServerResponse & { statusCode: number } {
  const response = {
    statusCode: 0,
    headersSent: false,
    setHeader: vi.fn(),
    writeHead(status: number) {
      this.statusCode = status;
      this.headersSent = true;
      return this;
    },
    end: vi.fn(),
  };
  return response as unknown as ServerResponse & { statusCode: number };
}

function makeApi(trustProxyHeader = false): {
  api: PixWebhookApi;
  notify: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const api = new PixWebhookApi({
    secrets: [SECRET],
    service: { notify } as unknown as PixOrderService,
    trustProxyHeader,
  });
  return { api, notify };
}

function logLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((call) => String(call[0]));
}

let logInfo: ReturnType<typeof vi.spyOn>;
let logWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logInfo = vi.spyOn(console, "log").mockImplementation(() => {});
  logWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PixWebhookApi", () => {
  it("accepts a signed payment notification and hands off the payment id", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654&type=payment`,
        headers: signedHeaders("987654"),
        body: JSON.stringify({ type: "payment", data: { id: "987654" } }),
      }),
      response,
    );
    expect(response.statusCode).toBe(200);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("987654");
  });

  it("rejects a forged signature and never touches the service", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654&type=payment`,
        headers: {
          "x-signature": `ts=${Math.floor(Date.now() / 1000)},v1=${"a".repeat(64)}`,
          "x-request-id": REQUEST_ID,
        },
        body: JSON.stringify({ type: "payment", data: { id: "987654" } }),
      }),
      response,
    );
    expect(response.statusCode).toBe(401);
    expect(notify).not.toHaveBeenCalled();
  });

  it("rejects an unsigned notification", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654`,
        body: JSON.stringify({ type: "payment", data: { id: "987654" } }),
      }),
      response,
    );
    expect(response.statusCode).toBe(401);
    expect(notify).not.toHaveBeenCalled();
  });

  it("never trusts the body's payment id over the signed query id", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=111&type=payment`,
        headers: signedHeaders("111"),
        body: JSON.stringify({ type: "payment", data: { id: "999" } }),
      }),
      response,
    );
    expect(response.statusCode).toBe(200);
    expect(notify).toHaveBeenCalledWith("111");
  });

  it("acknowledges but ignores non-payment topics", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654&type=test`,
        headers: signedHeaders("987654"),
        body: JSON.stringify({ type: "test", data: { id: "987654" } }),
      }),
      response,
    );
    expect(response.statusCode).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  });

  it("ignores a non-numeric payment id", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=..%2Fetc&type=payment`,
        headers: signedHeaders("../etc"),
        body: JSON.stringify({ type: "payment" }),
      }),
      response,
    );
    expect(response.statusCode).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses non-POST methods", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(makeRequest({ method: "GET" }), response);
    expect(response.statusCode).toBe(405);
    expect(notify).not.toHaveBeenCalled();
  });

  it("404s any other payments path", async () => {
    const { api } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({ url: "/api/payments/mercadopago/other" }),
      response,
    );
    expect(response.statusCode).toBe(404);
  });

  it("400s a body that is not JSON", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=1`,
        headers: signedHeaders("1"),
        body: "{not json",
      }),
      response,
    );
    expect(response.statusCode).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });

  it("400s an oversized body instead of buffering it", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=1`,
        headers: signedHeaders("1"),
        body: "x".repeat(17_000),
      }),
      response,
    );
    expect(response.statusCode).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });

  it("rate-limits a flooding ip", async () => {
    const { api } = makeApi();
    let lastStatus = 0;
    for (let index = 0; index < 61; index += 1) {
      const response = makeResponse();
      await api.handle(
        makeRequest({ url: `${PATH}?data.id=1`, body: "{}" }),
        response,
      );
      lastStatus = response.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  it("rejects an unsigned request before reading its body, even when the body is garbage", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    const request = makeRequest({
      url: `${PATH}?data.id=1`,
      body: "{not json",
    });
    const resume = vi.spyOn(request, "resume");
    await api.handle(request, response);
    expect(response.statusCode).toBe(401);
    expect(resume).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("logs every rejection with ip, request id and reason, and every acceptance with the payment id", async () => {
    const { api } = makeApi();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654`,
        body: "{}",
        ip: "198.51.100.7",
      }),
      makeResponse(),
    );
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654&type=payment`,
        headers: signedHeaders("987654"),
        body: JSON.stringify({ type: "payment", data: { id: "987654" } }),
        ip: "198.51.100.8",
      }),
      makeResponse(),
    );
    expect(logLines(logWarn)).toContainEqual(
      "pix.webhook-rejected ip=198.51.100.7 reason=invalid-signature dataId=987654",
    );
    expect(logLines(logInfo)).toContainEqual(
      "pix.webhook-accepted ip=198.51.100.8 requestId=req-1 paymentId=987654",
    );
  });

  it("never writes the signature header or the body into the log", async () => {
    const { api } = makeApi();
    const headers = signedHeaders("987654");
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654`,
        headers,
        body: JSON.stringify({
          type: "payment",
          data: { id: "987654" },
          secret_marker: "BODYMARK",
        }),
      }),
      makeResponse(),
    );
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654`,
        headers: { "x-signature": "ts=1,v1=SIGMARK" },
        body: "{}",
      }),
      makeResponse(),
    );
    const everything = [...logLines(logInfo), ...logLines(logWarn)].join("\n");
    expect(everything).not.toContain("BODYMARK");
    expect(everything).not.toContain("SIGMARK");
    expect(everything).not.toContain(headers["x-signature"]!.slice(-20));
  });

  it("acknowledges a replayed notification but dispatches it only once", async () => {
    const { api, notify } = makeApi();
    const headers = signedHeaders("987654");
    for (let index = 0; index < 3; index += 1) {
      const response = makeResponse();
      await api.handle(
        makeRequest({ url: `${PATH}?data.id=987654`, headers, body: "{}" }),
        response,
      );
      expect(response.statusCode).toBe(200);
    }
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("987654");
    expect(
      logLines(logWarn).filter((line) =>
        line.startsWith("pix.webhook-replayed"),
      ),
    ).toHaveLength(2);
    // A provider retry carries a fresh timestamp: a fresh digest, dispatched.
    const retry = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654`,
        headers: signedHeaders("987654"),
        body: "{}",
      }),
      retry,
    );
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("does not let a replay poison the cache for a different valid notification", async () => {
    const { api, notify } = makeApi();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=1`,
        headers: signedHeaders("1"),
        body: "{}",
      }),
      makeResponse(),
    );
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=2`,
        headers: signedHeaders("2"),
        body: "{}",
      }),
      makeResponse(),
    );
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("remembers a bounded number of digests", async () => {
    const { api } = makeApi();
    for (let index = 0; index < 10_050; index += 1) {
      (api as unknown as { replayed: (h: string) => boolean }).replayed(
        `ts=1,v1=${index.toString(16).padStart(64, "0")}`,
      );
    }
    const seen = (api as unknown as { seenDigests: Map<string, number> })
      .seenDigests;
    expect(seen.size).toBeLessThanOrEqual(10_000);
  });

  it("verifies against every configured secret so a rotation keeps in-flight notifications valid", async () => {
    const notify = vi.fn();
    const api = new PixWebhookApi({
      secrets: ["new-secret", SECRET],
      service: { notify } as unknown as PixOrderService,
      trustProxyHeader: false,
    });
    for (const secret of ["new-secret", SECRET]) {
      const response = makeResponse();
      await api.handle(
        makeRequest({
          url: `${PATH}?data.id=987654`,
          headers: signedHeaders("987654", secret),
          body: "{}",
        }),
        response,
      );
      expect(response.statusCode).toBe(200);
    }
    const stale = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654`,
        headers: signedHeaders("987654", "retired-secret"),
        body: "{}",
      }),
      stale,
    );
    expect(stale.statusCode).toBe(401);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("refuses to start without a secret", () => {
    expect(
      () =>
        new PixWebhookApi({
          secrets: [],
          service: { notify: vi.fn() } as unknown as PixOrderService,
          trustProxyHeader: false,
        }),
    ).toThrow("at least one secret");
  });

  it("ignores a signed request whose query id is not a payment id", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=${encodeURIComponent("../../admin")}`,
        headers: signedHeaders("../../admin"),
        body: JSON.stringify({ data: { id: "987654" } }),
      }),
      response,
    );
    expect(response.statusCode).toBe(200);
    expect(notify).not.toHaveBeenCalled();
    expect(logLines(logWarn)).toContainEqual(
      expect.stringContaining("pix.webhook-ignored"),
    );
  });

  it("uses the body payment id only when the query carries none, and only if numeric", async () => {
    const { api, notify } = makeApi();
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = createHmac("sha256", SECRET)
      .update(`request-id:${REQUEST_ID};ts:${ts};`)
      .digest("hex");
    const headers = {
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": REQUEST_ID,
    };
    await api.handle(
      makeRequest({
        url: PATH,
        headers,
        body: JSON.stringify({ type: "payment", data: { id: 123456 } }),
      }),
      makeResponse(),
    );
    await api.handle(
      makeRequest({
        url: PATH,
        headers,
        body: JSON.stringify({ type: "payment", data: { id: "1e5" } }),
      }),
      makeResponse(),
    );
    await api.handle(
      makeRequest({
        url: PATH,
        headers,
        body: JSON.stringify({ type: "payment", data: { id: { $gt: 0 } } }),
      }),
      makeResponse(),
    );
    await api.handle(
      makeRequest({
        url: PATH,
        headers,
        body: JSON.stringify({ type: "payment", data: "123" }),
      }),
      makeResponse(),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("123456");
  });

  it("caps the payment id length", async () => {
    const { api, notify } = makeApi();
    const long = "9".repeat(33);
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=${long}`,
        headers: signedHeaders(long),
        body: "{}",
      }),
      makeResponse(),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("404s an over-long url without reading anything", async () => {
    const { api, notify } = makeApi();
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=1&pad=${"x".repeat(2_100)}`,
        body: "{}",
      }),
      response,
    );
    expect(response.statusCode).toBe(404);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not let path tricks reach the handler", async () => {
    const { api, notify } = makeApi();
    for (const url of [
      `${PATH}/`,
      "/api/payments/MERCADOPAGO/webhook",
      "/api/payments/mercadopago/webhook%00",
      "/api/payments/mercadopago/webhook%2F",
      "/api/payments/",
    ]) {
      const response = makeResponse();
      await api.handle(
        makeRequest({ url, headers: signedHeaders("1"), body: "{}" }),
        response,
      );
      expect(response.statusCode).toBe(404);
    }
    // Dot segments normalise onto the real endpoint, which still demands a
    // signature over the (absent) query id.
    const normalised = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}/../webhook`,
        headers: signedHeaders("1"),
        body: "{}",
      }),
      normalised,
    );
    expect(normalised.statusCode).toBe(401);
    expect(notify).not.toHaveBeenCalled();
  });

  it("takes the first value of a duplicated signature header", async () => {
    const { api, notify } = makeApi();
    const good = signedHeaders("987654");
    const response = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654`,
        headers: {
          "x-signature": [good["x-signature"]!, "ts=1,v1=00"],
          "x-request-id": [REQUEST_ID, "other"],
        },
        body: "{}",
      }),
      response,
    );
    expect(response.statusCode).toBe(200);
    expect(notify).toHaveBeenCalledWith("987654");
  });

  it("logs rate-limit trips and recovers after the window", async () => {
    vi.useFakeTimers();
    const { api, notify } = makeApi();
    for (let index = 0; index < 60; index += 1) {
      await api.handle(
        makeRequest({
          url: `${PATH}?data.id=987654`,
          headers: signedHeaders("987654"),
          body: "{}",
        }),
        makeResponse(),
      );
    }
    const blocked = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654`,
        headers: signedHeaders("987654"),
        body: "{}",
      }),
      blocked,
    );
    expect(blocked.statusCode).toBe(429);
    expect(notify).toHaveBeenCalledTimes(60);
    expect(logLines(logWarn)).toContainEqual(
      "pix.webhook-rate-limited ip=203.0.113.5 requestId=req-1",
    );
    await vi.advanceTimersByTimeAsync(60_000);
    const allowed = makeResponse();
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=987654`,
        headers: signedHeaders("987654"),
        body: "{}",
      }),
      allowed,
    );
    expect(allowed.statusCode).toBe(200);
  });

  it("enforces the global ceiling across many source ips", async () => {
    const { api } = makeApi();
    let blocked = 0;
    for (let index = 0; index < 650; index += 1) {
      const response = makeResponse();
      await api.handle(
        makeRequest({
          url: `${PATH}?data.id=1`,
          body: "{}",
          ip: `10.0.${Math.floor(index / 50)}.${index % 50}`,
        }),
        response,
      );
      if (response.statusCode === 429) blocked += 1;
    }
    expect(blocked).toBe(50);
  });

  it("answers with no-store and json, never echoing request content", async () => {
    const { api } = makeApi();
    const response = makeResponse();
    const writeHead = vi.spyOn(response, "writeHead");
    await api.handle(
      makeRequest({
        url: `${PATH}?data.id=1`,
        headers: { "x-signature": "ts=1,v1=zz" },
        body: '{"echo":"ME"}',
      }),
      response,
    );
    expect(writeHead).toHaveBeenCalledWith(
      401,
      expect.objectContaining({
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      }),
    );
    const body = String(
      (response.end as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
    );
    expect(body).toBe(JSON.stringify({ error: "invalid-signature" }));
  });

  it("buckets by the proxy-set client ip only when the proxy is trusted, never by x-forwarded-for", async () => {
    const untrusted = makeApi(false);
    for (let index = 0; index < 61; index += 1) {
      const response = makeResponse();
      await untrusted.api.handle(
        makeRequest({
          url: `${PATH}?data.id=1`,
          headers: {
            "fly-client-ip": `172.16.0.${index}`,
            "x-forwarded-for": `172.16.0.${index}`,
          },
          body: "{}",
        }),
        response,
      );
      if (index === 60) expect(response.statusCode).toBe(429);
    }
    const trusted = makeApi(true);
    for (let index = 0; index < 61; index += 1) {
      const response = makeResponse();
      await trusted.api.handle(
        makeRequest({
          url: `${PATH}?data.id=1`,
          headers: { "fly-client-ip": `172.16.0.${index}` },
          body: "{}",
        }),
        response,
      );
      expect(response.statusCode).toBe(401);
    }
    expect(logLines(logWarn)).toContainEqual(
      expect.stringContaining("ip=172.16.0.60 "),
    );
    // Client-controlled x-forwarded-for cannot pick the bucket even when the proxy is trusted.
    const spoofing = makeApi(true);
    let blocked = 0;
    for (let index = 0; index < 61; index += 1) {
      const response = makeResponse();
      await spoofing.api.handle(
        makeRequest({
          url: `${PATH}?data.id=1`,
          headers: { "x-forwarded-for": `198.51.100.${index}, 10.0.0.1` },
          body: "{}",
        }),
        response,
      );
      if (response.statusCode === 429) blocked += 1;
    }
    expect(blocked).toBe(1);
  });
});
