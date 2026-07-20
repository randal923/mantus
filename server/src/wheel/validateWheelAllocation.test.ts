import { describe, expect, it } from "vitest";
import { validateWheelAllocation, WHEEL_LIMITS } from "@tibia/protocol";

const empty = (): number[] => new Array(WHEEL_LIMITS.sliceCount).fill(0);

const withSlices = (
  points: Readonly<Record<number, number>>,
): number[] => {
  const slices = empty();
  for (const [id, value] of Object.entries(points)) {
    slices[Number(id) - 1] = value;
  }
  return slices;
};

describe("validateWheelAllocation", () => {
  it("accepts an empty wheel", () => {
    expect(validateWheelAllocation(empty(), 0)).toEqual({ ok: true });
  });

  it("accepts a full root plus a partial connected neighbor", () => {
    // Slice 15 is the green root; slice 9 neighbors it on ring 2.
    const slices = withSlices({ 15: 50, 9: 30 });
    expect(validateWheelAllocation(slices, 100)).toEqual({ ok: true });
  });

  it("accepts partial points on a root without neighbors", () => {
    expect(validateWheelAllocation(withSlices({ 16: 25 }), 25)).toEqual({
      ok: true,
    });
  });

  it("rejects a wrong-size snapshot", () => {
    expect(validateWheelAllocation([0, 0, 0], 100).ok).toBe(false);
  });

  it("rejects points above the slice capacity", () => {
    expect(validateWheelAllocation(withSlices({ 15: 51 }), 100).ok).toBe(
      false,
    );
  });

  it("rejects non-integer and negative points", () => {
    expect(validateWheelAllocation(withSlices({ 15: 10.5 }), 100).ok).toBe(
      false,
    );
    expect(validateWheelAllocation(withSlices({ 15: -1 }), 100).ok).toBe(
      false,
    );
  });

  it("rejects allocations beyond the earned point budget", () => {
    expect(validateWheelAllocation(withSlices({ 15: 50 }), 49).ok).toBe(false);
  });

  it("rejects a non-root slice with no completely-full neighbor", () => {
    // Slice 9 needs a full neighbor; 15 at 49/50 does not unlock it.
    const slices = withSlices({ 15: 49, 9: 1 });
    expect(validateWheelAllocation(slices, 100).ok).toBe(false);
  });

  it("rejects floating islands of mutually-full slices", () => {
    // 9 and 14 are full and adjacent to each other, but neither has a
    // chain of full slices back to a root.
    const slices = withSlices({ 9: 75, 14: 75 });
    expect(validateWheelAllocation(slices, 200).ok).toBe(false);
  });

  it("accepts a full chain from the root outward", () => {
    // 15 (root, 50) -> 9 (75) -> 3 (100) -> 2 (150) -> 1 (200).
    const slices = withSlices({ 15: 50, 9: 75, 3: 100, 2: 150, 1: 200 });
    expect(validateWheelAllocation(slices, 600)).toEqual({ ok: true });
  });

  it("accepts unlocking across a cross-domain seam", () => {
    // Red root 16 -> 10 (ring 2) is full; 9 in green connects to 10.
    const slices = withSlices({ 16: 50, 10: 75, 9: 20 });
    expect(validateWheelAllocation(slices, 200)).toEqual({ ok: true });
  });
});
