import { describe, expect, it } from "vitest";
import { deriveCharacterStats } from "./deriveCharacterStats";

describe("deriveCharacterStats", () => {
  it("applies Featherweight as a floored percent of the pre-bonus base capacity", () => {
    const base = deriveCharacterStats({
      vocation: "Knight",
      definitionVersion: 1,
      level: 20,
    });
    const boosted = deriveCharacterStats({
      vocation: "Knight",
      definitionVersion: 1,
      level: 20,
      equipment: [{ capacityPercentOfBase: 9 }],
    });
    expect(boosted.capacity).toBe(
      base.capacity + Math.floor((base.capacity * 9) / 100),
    );
  });

  it("stacks percent-of-base with flat capacity and speed modifiers", () => {
    const base = deriveCharacterStats({
      vocation: "Druid",
      definitionVersion: 1,
      level: 8,
    });
    const boosted = deriveCharacterStats({
      vocation: "Druid",
      definitionVersion: 1,
      level: 8,
      equipment: [{ capacityPercentOfBase: 3, capacity: 50, speed: 15 }],
    });
    expect(boosted.capacity).toBe(
      base.capacity + Math.floor((base.capacity * 3) / 100) + 50,
    );
    expect(boosted.speed).toBe(base.speed + 15);
  });
});
