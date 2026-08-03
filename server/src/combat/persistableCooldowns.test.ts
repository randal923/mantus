import { describe, expect, it } from "vitest";
import { persistableCooldowns } from "./persistableCooldowns";

describe("persistableCooldowns", () => {
  it("keeps only still-hot entries the table's checks accept", () => {
    const now = 1_000_000;
    const rows = persistableCooldowns(
      new Map([
        ["spell:uteta-res-eq", { readyAt: now + 7_000_000, totalMs: 7_200_000 }],
        ["group:attack", { readyAt: now + 1_500, totalMs: 2_000 }],
        ["spell:expired", { readyAt: now, totalMs: 10_000 }],
        ["spell:too-long", { readyAt: now + 1, totalMs: 7_200_001 }],
        ["x".repeat(129), { readyAt: now + 1, totalMs: 1_000 }],
      ]),
      now,
    );

    expect(rows).toEqual([
      {
        key: "spell:uteta-res-eq",
        readyAt: now + 7_000_000,
        totalMs: 7_200_000,
      },
      { key: "group:attack", readyAt: now + 1_500, totalMs: 2_000 },
    ]);
  });
});
