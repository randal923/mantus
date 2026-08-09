import { describe, expect, it } from "vitest";
import { parseLootFilter } from "./parseLootFilter";

const COIN_RULES = [{ typeId: 3031 }, { typeId: 3035 }, { typeId: 3043 }];

describe("parseLootFilter", () => {
  it("keeps a valid stored filter as-is", () => {
    const filter = {
      enabled: true,
      pickupRules: [{ typeId: 3035 }, { typeId: 2400, rarities: ["epic"] }],
    };
    expect(parseLootFilter(filter)).toEqual(filter);
  });

  it("degrades corrupt rows to the disabled coin default", () => {
    expect(parseLootFilter(null)).toEqual({
      enabled: false,
      pickupRules: COIN_RULES,
    });
    expect(
      parseLootFilter({ enabled: true, ignoredItemTypeIds: [3031] }),
    ).toEqual({ enabled: false, pickupRules: COIN_RULES });
  });

  it("drops duplicate rules for the same type", () => {
    expect(
      parseLootFilter({
        enabled: true,
        pickupRules: [
          { typeId: 3031 },
          { typeId: 3031, rarities: ["rare"] },
          { typeId: 3035 },
        ],
      }),
    ).toEqual({
      enabled: true,
      pickupRules: [{ typeId: 3031 }, { typeId: 3035 }],
    });
  });
});
