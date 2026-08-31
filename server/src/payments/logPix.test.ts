import { afterEach, describe, expect, it, vi } from "vitest";
import { logPix } from "./logPix";

describe("logPix", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one grep-able line with key=value fields", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logPix("info", "order-created", {
      orderId: "abc",
      coins: 100,
      characterId: null,
      skipped: undefined,
      ok: true,
    });
    expect(log).toHaveBeenCalledWith(
      "pix.order-created orderId=abc coins=100 characterId=null ok=true",
    );
  });

  it("quotes values that would break the key=value grammar", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logPix("warn", "provider-error", { reason: "mercadopago GET failed: 500" });
    expect(warn).toHaveBeenCalledWith(
      'pix.provider-error reason="mercadopago GET failed: 500"',
    );
  });

  it("routes error level to console.error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logPix("error", "settle-refused", {
      orderId: "x",
      reason: "amount-mismatch",
    });
    expect(error).toHaveBeenCalledWith(
      "pix.settle-refused orderId=x reason=amount-mismatch",
    );
  });
});
