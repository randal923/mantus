import { describe, expect, it } from "vitest";
import { LOOT_FILTER_MAX_ENTRIES, type LootFilter } from "@tibia/protocol";
import { toggleLootFilterRule } from "./toggleLootFilterRule";

const AXE = 3274;
const GOLD = 3031;

const empty: LootFilter = { enabled: true, pickupRules: [] };

describe("toggleLootFilterRule", () => {
  it("adds and removes a whole type", () => {
    const added = toggleLootFilterRule(empty, GOLD);
    expect(added.pickupRules).toEqual([{ typeId: GOLD }]);
    expect(toggleLootFilterRule(added, GOLD).pickupRules).toEqual([]);
  });

  it("adds a single grade of a type that was not listed", () => {
    expect(toggleLootFilterRule(empty, AXE, "rare").pickupRules).toEqual([
      { typeId: AXE, rarities: ["rare"] },
    ]);
  });

  it("keeps grades in catalog order as they are added", () => {
    const rare = toggleLootFilterRule(empty, AXE, "rare");
    expect(toggleLootFilterRule(rare, AXE, "uncommon").pickupRules).toEqual([
      { typeId: AXE, rarities: ["uncommon", "rare"] },
    ]);
  });

  it("carves one grade out of a type listed whole", () => {
    const whole: LootFilter = {
      enabled: true,
      pickupRules: [{ typeId: AXE }],
    };
    expect(toggleLootFilterRule(whole, AXE, "common").pickupRules).toEqual([
      { typeId: AXE, rarities: ["uncommon", "rare", "epic", "legendary"] },
    ]);
  });

  it("collapses a full grade set back to the whole type", () => {
    const four: LootFilter = {
      enabled: true,
      pickupRules: [
        { typeId: AXE, rarities: ["common", "uncommon", "rare", "epic"] },
      ],
    };
    expect(toggleLootFilterRule(four, AXE, "legendary").pickupRules).toEqual([
      { typeId: AXE },
    ]);
  });

  it("drops the rule when its last grade is removed", () => {
    const one: LootFilter = {
      enabled: true,
      pickupRules: [{ typeId: AXE, rarities: ["rare"] }],
    };
    expect(toggleLootFilterRule(one, AXE, "rare").pickupRules).toEqual([]);
  });

  it("refuses to grow past the entry cap the server enforces", () => {
    const full: LootFilter = {
      enabled: true,
      pickupRules: Array.from({ length: LOOT_FILTER_MAX_ENTRIES }, (_, i) => ({
        typeId: i + 1,
      })),
    };
    expect(toggleLootFilterRule(full, AXE)).toBe(full);
    // Editing a rule that is already there still works at the cap.
    expect(toggleLootFilterRule(full, 1, "rare").pickupRules).toHaveLength(
      LOOT_FILTER_MAX_ENTRIES,
    );
  });

  it("never mutates the filter it was given", () => {
    const filter: LootFilter = {
      enabled: true,
      pickupRules: [{ typeId: AXE, rarities: ["rare"] }],
    };
    toggleLootFilterRule(filter, AXE, "epic");
    expect(filter.pickupRules).toEqual([{ typeId: AXE, rarities: ["rare"] }]);
  });
});
