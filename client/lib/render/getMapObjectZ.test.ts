import { describe, expect, it } from "vitest";
import { getMapObjectZ } from "./getMapObjectZ";

describe("getMapObjectZ", () => {
  it("sorts tiles by diagonal and then west to east", () => {
    expect(getMapObjectZ(9, 11, 0)).toBeLessThan(
      getMapObjectZ(10, 10, 0),
    );
    expect(getMapObjectZ(10, 10, 0)).toBeLessThan(
      getMapObjectZ(10, 11, 0),
    );
  });

  it("preserves stack order within a tile", () => {
    expect(getMapObjectZ(10, 10, 256)).toBeLessThan(
      getMapObjectZ(10, 10, 512),
    );
  });
});
