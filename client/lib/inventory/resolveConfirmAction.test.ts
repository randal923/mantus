import { describe, expect, it } from "vitest";
import { resolveConfirmAction } from "./resolveConfirmAction";

describe("resolveConfirmAction", () => {
  it("settles an external preview before anything else", () => {
    expect(
      resolveConfirmAction({
        hasPreview: true,
        inFlight: true,
        echoedNonce: "n1",
        inFlightNonce: "n1",
      }),
    ).toBe("advance-preview");
  });

  it("advances the in-flight drag only on a matching nonce echo", () => {
    expect(
      resolveConfirmAction({
        hasPreview: false,
        inFlight: true,
        echoedNonce: "n7",
        inFlightNonce: "n7",
      }),
    ).toBe("advance-drag");
  });

  it("does not advance the queue for an unsolicited mid-flight update", () => {
    // Potion/food/decay update: no nonce echoed.
    expect(
      resolveConfirmAction({
        hasPreview: false,
        inFlight: true,
        echoedNonce: undefined,
        inFlightNonce: "n7",
      }),
    ).toBe("patch-only");
    // A different op's echo (out of order) must not settle this drag.
    expect(
      resolveConfirmAction({
        hasPreview: false,
        inFlight: true,
        echoedNonce: "n6",
        inFlightNonce: "n7",
      }),
    ).toBe("patch-only");
  });

  it("patches when nothing is in flight", () => {
    expect(
      resolveConfirmAction({
        hasPreview: false,
        inFlight: false,
        echoedNonce: "n1",
        inFlightNonce: null,
      }),
    ).toBe("patch-only");
  });
});
