import { describe, expect, it } from "vitest";
import { planNpcFarePayment } from "./planNpcFarePayment";

describe("planNpcFarePayment", () => {
  it("pays exactly with gold when enough gold is carried", () => {
    expect(planNpcFarePayment(200, 0, 110)).toEqual({
      goldSpent: 110,
      platinumSpent: 0,
      goldChange: 0,
    });
  });

  it("returns exact gold change when platinum covers the fare", () => {
    expect(planNpcFarePayment(0, 50, 110)).toEqual({
      goldSpent: 0,
      platinumSpent: 2,
      goldChange: 90,
    });
  });

  it("combines denominations without change when possible", () => {
    expect(planNpcFarePayment(90, 48, 130)).toEqual({
      goldSpent: 30,
      platinumSpent: 1,
      goldChange: 0,
    });
  });

  it("rejects an insufficient carried balance", () => {
    expect(planNpcFarePayment(20, 1, 130)).toBeNull();
  });
});
