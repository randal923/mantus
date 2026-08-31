import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMercadoPagoSignature } from "./verifyMercadoPagoSignature";

const SECRET = "test-webhook-secret";
const REQUEST_ID = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";
const TS = "1704908010";
const NOW_MS = Number(TS) * 1000;

function sign(manifest: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

function headerFor(dataId: string | undefined, ts = TS): string {
  let manifest = "";
  if (dataId) manifest += `id:${dataId};`;
  manifest += `request-id:${REQUEST_ID};`;
  manifest += `ts:${ts};`;
  return `ts=${ts},v1=${sign(manifest)}`;
}

describe("verifyMercadoPagoSignature", () => {
  it("accepts a correctly signed notification", () => {
    expect(
      verifyMercadoPagoSignature({
        secret: SECRET,
        xSignature: headerFor("123456"),
        xRequestId: REQUEST_ID,
        dataId: "123456",
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  it("lowercases an alphanumeric data id before signing", () => {
    expect(
      verifyMercadoPagoSignature({
        secret: SECRET,
        xSignature: headerFor("abc123def"),
        xRequestId: REQUEST_ID,
        dataId: "ABC123DEF",
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  it("omits the id segment when data id is absent", () => {
    expect(
      verifyMercadoPagoSignature({
        secret: SECRET,
        xSignature: headerFor(undefined),
        xRequestId: REQUEST_ID,
        dataId: undefined,
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const manifest = `id:123456;request-id:${REQUEST_ID};ts:${TS};`;
    expect(
      verifyMercadoPagoSignature({
        secret: SECRET,
        xSignature: `ts=${TS},v1=${sign(manifest, "attacker-secret")}`,
        xRequestId: REQUEST_ID,
        dataId: "123456",
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it("rejects a tampered data id", () => {
    expect(
      verifyMercadoPagoSignature({
        secret: SECRET,
        xSignature: headerFor("123456"),
        xRequestId: REQUEST_ID,
        dataId: "999999",
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it("rejects a tampered request id", () => {
    expect(
      verifyMercadoPagoSignature({
        secret: SECRET,
        xSignature: headerFor("123456"),
        xRequestId: "another-request",
        dataId: "123456",
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it("rejects a replay outside the tolerance window", () => {
    expect(
      verifyMercadoPagoSignature({
        secret: SECRET,
        xSignature: headerFor("123456"),
        xRequestId: REQUEST_ID,
        dataId: "123456",
        nowMs: NOW_MS + 25 * 60 * 60 * 1000,
      }),
    ).toBe(false);
  });

  it("accepts a millisecond timestamp within tolerance", () => {
    const tsMillis = String(NOW_MS);
    expect(
      verifyMercadoPagoSignature({
        secret: SECRET,
        xSignature: headerFor("123456", tsMillis),
        xRequestId: REQUEST_ID,
        dataId: "123456",
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  it("rejects malformed headers", () => {
    for (const xSignature of [
      undefined,
      "",
      "ts=,v1=",
      `ts=${TS}`,
      "v1=deadbeef",
      `ts=${TS},v1=nothex`,
      `ts=${TS},v1=${"a".repeat(63)}`,
    ]) {
      expect(
        verifyMercadoPagoSignature({
          secret: SECRET,
          xSignature,
          xRequestId: REQUEST_ID,
          dataId: "123456",
          nowMs: NOW_MS,
        }),
      ).toBe(false);
    }
  });

  it("rejects when the secret is empty", () => {
    expect(
      verifyMercadoPagoSignature({
        secret: "",
        xSignature: headerFor("123456"),
        xRequestId: REQUEST_ID,
        dataId: "123456",
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });
});
