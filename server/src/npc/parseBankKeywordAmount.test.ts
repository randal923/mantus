import { BANK_LIMITS } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { parseBankKeywordAmount } from "./parseBankKeywordAmount";

describe("parseBankKeywordAmount", () => {
  it("reads the amount out of a money line", () => {
    expect(parseBankKeywordAmount("deposit 500")).toBe(500);
    expect(parseBankKeywordAmount("  WITHDRAW   1  ")).toBe(1);
  });

  it("rejects a line without a usable amount", () => {
    expect(parseBankKeywordAmount("deposit")).toBeNull();
    expect(parseBankKeywordAmount("deposit all")).toBeNull();
    expect(parseBankKeywordAmount("deposit -5")).toBe(5);
    expect(parseBankKeywordAmount("deposit 0")).toBeNull();
  });

  it("rejects amounts the bank could never hold", () => {
    expect(parseBankKeywordAmount(`deposit ${BANK_LIMITS.maxBalance}`)).toBe(
      BANK_LIMITS.maxBalance,
    );
    expect(
      parseBankKeywordAmount(`deposit ${BANK_LIMITS.maxBalance + 1}`),
    ).toBeNull();
    // Long digit runs are rejected before they can lose integer precision.
    expect(parseBankKeywordAmount(`deposit ${"9".repeat(40)}`)).toBeNull();
  });

  it("does not read separators or exponents as part of the amount", () => {
    expect(parseBankKeywordAmount("deposit 1,000")).toBe(1);
    expect(parseBankKeywordAmount("deposit 1e9")).toBe(1);
  });
});
