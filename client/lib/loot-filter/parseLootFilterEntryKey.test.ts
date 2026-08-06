import { describe, expect, it } from "vitest";
import { parseLootFilterEntryKey } from "./parseLootFilterEntryKey";

describe("parseLootFilterEntryKey", () => {
  it("reads a bare type id", () => {
    expect(parseLootFilterEntryKey("3031")).toEqual({ typeId: 3031 });
  });

  it("reads a grade-scoped key", () => {
    expect(parseLootFilterEntryKey("3274:rare")).toEqual({
      typeId: 3274,
      rarity: "rare",
    });
  });

  it("rejects anything this window did not write", () => {
    for (const raw of [
      "",
      "abc",
      "-1",
      "0",
      "3274:",
      "3274:mythic",
      "3274:rare:1",
      "01",
    ]) {
      expect(parseLootFilterEntryKey(raw)).toBeNull();
    }
  });
});
