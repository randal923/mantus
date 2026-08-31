import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMercadoPagoSignature(input: {
  readonly secret: string;
  readonly xSignature: string | undefined;
  readonly xRequestId: string | undefined;
  readonly dataId: string | undefined;
  readonly nowMs?: number;
  readonly toleranceMs?: number;
}): boolean {
  if (!input.secret || !input.xSignature) return false;
  if (input.xSignature.length > 512) return false;

  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of input.xSignature.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (!/^\d{1,16}$/.test(ts)) return false;

  const toleranceMs = input.toleranceMs ?? 24 * 60 * 60 * 1000;
  const nowMs = input.nowMs ?? Date.now();
  const tsNumber = Number(ts);
  const asSeconds = Math.abs(nowMs - tsNumber * 1000);
  const asMillis = Math.abs(nowMs - tsNumber);
  if (Math.min(asSeconds, asMillis) > toleranceMs) return false;

  let manifest = "";
  if (input.dataId) {
    const dataId = /^[a-zA-Z0-9]+$/.test(input.dataId)
      ? input.dataId.toLowerCase()
      : input.dataId;
    manifest += `id:${dataId};`;
  }
  if (input.xRequestId) manifest += `request-id:${input.xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", input.secret)
    .update(manifest)
    .digest();
  const received = Buffer.from(v1, "hex");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
