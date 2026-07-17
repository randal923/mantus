import { STARTER_VOCATIONS } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { getStarterSet } from "./getStarterSet";

describe("getStarterSet", () => {
  it("gives every vocation a backpack, armor, and supplies", () => {
    const weaponIds = new Set<number>();

    for (const vocation of STARTER_VOCATIONS) {
      const starterSet = getStarterSet(vocation);
      const slots = new Set(starterSet.equipment.map((item) => item.slot));
      const weapon = starterSet.equipment.find((item) => item.slot === "weapon");

      expect(slots).toEqual(
        vocation === "Monk"
          ? new Set(["helmet", "backpack", "armor", "shield", "legs", "boots"])
          : new Set(["helmet", "backpack", "armor", "weapon", "shield", "legs", "boots"]),
      );
      if (vocation !== "Monk") expect(weapon).toBeDefined();
      expect(starterSet.backpackContents).toEqual(
        expect.arrayContaining([
          { typeId: 3035, count: 50 },
          { typeId: 266, count: 5 },
        ]),
      );
      if (weapon) weaponIds.add(weapon.typeId);
    }

    expect(weaponIds.size).toBe(STARTER_VOCATIONS.length - 1);
  });

  it("keeps vocation wands and rods in the backpack until level requirements are met", () => {
    expect(getStarterSet("Sorcerer").backpackContents).toContainEqual({
      typeId: 3074,
      count: 1,
    });
    expect(getStarterSet("Druid").backpackContents).toContainEqual({
      typeId: 3066,
      count: 1,
    });
    expect(getStarterSet("Monk").backpackContents).toContainEqual({
      typeId: 50181,
      count: 1,
    });
  });
});
