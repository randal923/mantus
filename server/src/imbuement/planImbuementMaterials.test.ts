import { describe, expect, it } from "vitest";
import { planImbuementMaterials } from "./planImbuementMaterials";

function plan(
  sources: ReadonlyArray<{ itemTypeId: number; count: number }>,
  carried: Record<number, number>,
  stash: Record<number, number>,
) {
  return planImbuementMaterials({
    sources,
    carriedCountOf: (typeId) => carried[typeId] ?? 0,
    stashCountOf: (typeId) => stash[typeId] ?? 0,
  });
}

describe("planImbuementMaterials", () => {
  it("spends carried rows alone when they cover the source", () => {
    expect(plan([{ itemTypeId: 9636, count: 25 }], { 9636: 40 }, { 9636: 99 }))
      .toEqual({ carried: [{ itemTypeId: 9636, count: 25 }], stash: [] });
  });

  it("draws only the shortfall from the stash", () => {
    expect(plan([{ itemTypeId: 9636, count: 25 }], { 9636: 10 }, { 9636: 60 }))
      .toEqual({
        carried: [{ itemTypeId: 9636, count: 10 }],
        stash: [{ itemTypeId: 9636, drawn: 15, remaining: 45 }],
      });
  });

  it("takes the whole source from the stash when none is carried", () => {
    expect(plan([{ itemTypeId: 5920, count: 5 }], {}, { 5920: 5 })).toEqual({
      carried: [],
      stash: [{ itemTypeId: 5920, drawn: 5, remaining: 0 }],
    });
  });

  it("rejects when carried and stash together fall short", () => {
    expect(plan([{ itemTypeId: 9636, count: 25 }], { 9636: 10 }, { 9636: 14 }))
      .toBeNull();
  });

  it("rejects if any one source is short, spending nothing", () => {
    expect(
      plan(
        [
          { itemTypeId: 9636, count: 25 },
          { itemTypeId: 5920, count: 5 },
        ],
        { 9636: 25 },
        { 5920: 4 },
      ),
    ).toBeNull();
  });

  it("plans each source independently", () => {
    expect(
      plan(
        [
          { itemTypeId: 9636, count: 25 },
          { itemTypeId: 5920, count: 5 },
          { itemTypeId: 5954, count: 5 },
        ],
        { 9636: 25, 5920: 2 },
        { 5920: 10, 5954: 5 },
      ),
    ).toEqual({
      carried: [
        { itemTypeId: 9636, count: 25 },
        { itemTypeId: 5920, count: 2 },
      ],
      stash: [
        { itemTypeId: 5920, drawn: 3, remaining: 7 },
        { itemTypeId: 5954, drawn: 5, remaining: 0 },
      ],
    });
  });
});
