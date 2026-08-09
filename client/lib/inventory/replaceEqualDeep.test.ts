import { describe, expect, it } from "vitest";
import { replaceEqualDeep } from "./replaceEqualDeep";

describe("replaceEqualDeep", () => {
  it("returns the previous reference when the snapshot is deep-equal", () => {
    const prev = { items: [{ id: "a", count: 1 }], capacityUsed: 10 };
    const next = { items: [{ id: "a", count: 1 }], capacityUsed: 10 };
    expect(replaceEqualDeep(prev, next)).toBe(prev);
  });

  it("reuses unchanged subtrees when a sibling changes", () => {
    const prev = {
      equipment: { helmet: { id: "h", spriteId: 1 } },
      containers: [] as Array<{ id: string }>,
    };
    const next = {
      equipment: { helmet: { id: "h", spriteId: 1 } },
      containers: [{ id: "c1" }],
    };
    const merged = replaceEqualDeep(prev, next);
    expect(merged).not.toBe(prev);
    expect(merged.equipment).toBe(prev.equipment);
    expect(merged.containers).toEqual([{ id: "c1" }]);
  });

  it("reuses unchanged array entries when one entry changes", () => {
    const prev = { items: [{ id: "a" }, { id: "b", count: 1 }] };
    const next = { items: [{ id: "a" }, { id: "b", count: 2 }] };
    const merged = replaceEqualDeep(prev, next);
    expect(merged.items[0]).toBe(prev.items[0]);
    expect(merged.items[1]).toEqual({ id: "b", count: 2 });
  });

  it("takes the next value when shapes differ", () => {
    expect(replaceEqualDeep({ a: 1 }, [1])).toEqual([1]);
    expect(replaceEqualDeep(null, { a: 1 })).toEqual({ a: 1 });
    expect(replaceEqualDeep({ a: 1 }, undefined)).toBeUndefined();
    expect(replaceEqualDeep([1, 2], [1])).toEqual([1]);
    expect(replaceEqualDeep({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
  });
});
