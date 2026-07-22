import { afterEach, describe, expect, it, vi } from "vitest";
import { monotonicNow } from "./monotonicNow";

describe("monotonicNow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not move backward when the wall clock is corrected backward", () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(10_000)
      .mockReturnValueOnce(8_000);

    const wallBefore = Date.now();
    const before = monotonicNow();
    const wallAfter = Date.now();
    const after = monotonicNow();

    expect(wallAfter).toBeLessThan(wallBefore);
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
