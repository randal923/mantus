import { STARTER_VOCATIONS } from "@tibia/protocol";
import { beforeAll, describe, expect, it } from "vitest";
import type { ItemCatalog } from "./ItemCatalog";
import { getStarterSet } from "./getStarterSet";
import { loadItemCatalog } from "./loadItemCatalog";

describe("getStarterSet", () => {
  let catalog: ItemCatalog;

  beforeAll(async () => {
    catalog = await loadItemCatalog();
  });

  it("gives every vocation a backpack, armor, and supplies", () => {
    const weaponIds = new Set<number>();

    for (const vocation of STARTER_VOCATIONS) {
      const starterSet = getStarterSet(vocation);
      const slots = new Set(starterSet.equipment.map((item) => item.slot));
      const weapon = starterSet.equipment.find((item) => item.slot === "weapon");

      expect(slots).toEqual(
        vocation === "Monk"
          ? new Set(["helmet", "backpack", "armor", "weapon", "legs", "boots"])
          : new Set(["helmet", "backpack", "armor", "weapon", "shield", "legs", "boots"]),
      );
      expect(weapon).toBeDefined();
      expect(starterSet.backpackContents).toEqual(
        expect.arrayContaining([
          { typeId: 3035, count: 50 },
          { typeId: 266, count: 5 },
        ]),
      );
      if (weapon) weaponIds.add(weapon.typeId);
    }

    expect(weaponIds.size).toBe(STARTER_VOCATIONS.length);
  });

  it("equips only items each level-one vocation can use", () => {
    for (const vocation of STARTER_VOCATIONS) {
      const equipment = getStarterSet(vocation).equipment;

      for (const starterItem of equipment) {
        const itemType = catalog.require(starterItem.typeId);

        expect(itemType.equipmentSlot).toBe(starterItem.slot);
        expect(itemType.requirements?.level ?? 0).toBeLessThanOrEqual(1);
        if (itemType.requirements?.vocations) {
          expect(itemType.requirements.vocations).toContain(vocation);
        }
        if (itemType.slotType === "two-handed") {
          expect(equipment.some((item) => item.slot === "shield")).toBe(false);
        }
      }
    }
  });

  it("starts the Monk with a simple jo staff instead of level-ten fists", () => {
    const starterSet = getStarterSet("Monk");

    expect(starterSet.equipment).toContainEqual({
      typeId: 50166,
      slot: "weapon",
    });
    expect(starterSet.equipment.some((item) => item.slot === "shield")).toBe(
      false,
    );
    expect(starterSet.backpackContents).not.toContainEqual({
      typeId: 50181,
      count: 1,
    });
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
