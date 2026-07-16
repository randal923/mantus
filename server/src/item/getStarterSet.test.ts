import { CHARACTER_VOCATIONS } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { getStarterSet } from "./getStarterSet";

describe("getStarterSet", () => {
  it("gives every vocation a backpack, armor, supplies, and its own weapon", () => {
    const weaponIds = new Set<number>();

    for (const vocation of CHARACTER_VOCATIONS) {
      const starterSet = getStarterSet(vocation);
      const slots = new Set(starterSet.equipment.map((item) => item.slot));
      const weapon = starterSet.equipment.find((item) => item.slot === "weapon");

      expect(slots).toEqual(
        new Set(["helmet", "backpack", "armor", "weapon", "shield", "legs", "boots"]),
      );
      expect(weapon).toBeDefined();
      expect(starterSet.backpackContents).toEqual(
        expect.arrayContaining([
          { typeId: 3031, count: 100 },
          { typeId: 266, count: 5 },
        ]),
      );
      if (weapon) weaponIds.add(weapon.typeId);
    }

    expect(weaponIds.size).toBe(CHARACTER_VOCATIONS.length);
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
  });
});
