import { describe, expect, it } from "vitest";
import {
  LOOT_FILTER_MAX_ENTRIES,
  PROTOCOL_LIMITS,
  ITEM_DISPLAY_RARITIES,
  lootFilterSchema,
} from "@tibia/protocol";
import { lootFilterTakes } from "./lootFilterTakes";

const AXE = 3274;
const GOLD = 3031;

describe("lootFilterTakes", () => {
  it("takes every grade of a type listed without one", () => {
    const rules = [{ typeId: AXE }];
    expect(lootFilterTakes(rules, AXE, "common")).toBe(true);
    expect(lootFilterTakes(rules, AXE, "legendary")).toBe(true);
    expect(lootFilterTakes(rules, AXE, undefined)).toBe(true);
  });

  it("takes only the listed grades", () => {
    const rules = [{ typeId: AXE, rarities: ["rare" as const] }];
    expect(lootFilterTakes(rules, AXE, "rare")).toBe(true);
    expect(lootFilterTakes(rules, AXE, "epic")).toBe(false);
    expect(lootFilterTakes(rules, AXE, "common")).toBe(false);
  });

  it("never takes a gradeless drop on a grade-scoped rule", () => {
    // A stale grade list on a type that cannot roll one (a later catalog
    // change, say) must narrow the sweep, never widen it.
    const rules = [{ typeId: GOLD, rarities: ["common" as const] }];
    expect(lootFilterTakes(rules, GOLD, undefined)).toBe(false);
  });

  it("takes nothing for an unlisted type", () => {
    expect(lootFilterTakes([{ typeId: AXE }], GOLD, undefined)).toBe(false);
    expect(lootFilterTakes([], AXE, "rare")).toBe(false);
  });
});

describe("loot filter wire budget", () => {
  it("keeps a full list of fully-graded rules under the transport cap", () => {
    const filter = {
      enabled: true,
      pickupRules: Array.from({ length: LOOT_FILTER_MAX_ENTRIES }, (_, i) => ({
        typeId: 65_535 - i,
        rarities: [...ITEM_DISPLAY_RARITIES],
      })),
    };
    expect(lootFilterSchema.safeParse(filter).success).toBe(true);
    const bytes = Buffer.byteLength(
      JSON.stringify({ type: "update-loot-filter", filter }),
    );
    expect(bytes).toBeLessThan(PROTOCOL_LIMITS.maxMessageBytes);
  });
});
