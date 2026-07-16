import { describe, expect, it } from "vitest";
import { getItemInstanceSeed } from "./getItemInstanceSeed";

describe("getItemInstanceSeed", () => {
  it("is stable per instance and distinguishes neighboring map items", () => {
    expect(getItemInstanceSeed("map:100:200:7:0")).toBe(
      getItemInstanceSeed("map:100:200:7:0"),
    );
    expect(getItemInstanceSeed("map:100:200:7:0")).not.toBe(
      getItemInstanceSeed("map:101:200:7:0"),
    );
  });
});
