import { describe, expect, it } from "vitest";
import { clampAddonsToGranted, selectableAddons } from "./selectableAddons";

describe("selectableAddons", () => {
  it("maps each granted bit to its checkbox", () => {
    expect(selectableAddons(0)).toEqual({ first: false, second: false });
    expect(selectableAddons(1)).toEqual({ first: true, second: false });
    expect(selectableAddons(2)).toEqual({ first: false, second: true });
    expect(selectableAddons(3)).toEqual({ first: true, second: true });
  });
});

describe("clampAddonsToGranted", () => {
  it("drops selection bits the server never granted", () => {
    expect(clampAddonsToGranted(3, 1)).toBe(1);
    expect(clampAddonsToGranted(3, 0)).toBe(0);
    expect(clampAddonsToGranted(2, 3)).toBe(2);
    expect(clampAddonsToGranted(7, 3)).toBe(3);
  });
});
