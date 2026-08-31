import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { PixOrderService } from "./PixOrderService";
import { PixWebhookApi } from "./PixWebhookApi";

const SECRET = "webhook-secret";
const REQUEST_ID = "req-1";
const PATH = "/api/payments/mercadopago/webhook";

function signedHeaders(dataId: string): Record<string, string> {
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${REQUEST_ID};ts:${ts};`;
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": REQUEST_ID };
}

function makeRequest(input: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  ip?: string;
}): IncomingMessage {
  const readable = Readable.from(
    input.body === undefined ? [] : [Buffer.from(input.body)],
  ) as unknown as IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
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

function makeApi(): { api: PixWebhookApi; notify: ReturnType<typeof vi.fn> } {
  const notify = vi.fn();
  const api = new PixWebhookApi({
    secret: SECRET,
    service: { notify } as unknown as PixOrderService,
    trustProxyHeader: false,
  });
  return { api, notify };
}

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
      makeRequest({ url: `${PATH}?data.id=1`, body: "{not json" }),
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
});
