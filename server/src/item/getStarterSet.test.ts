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
          ? new Set(["helmet", "backpack", "armor", "weapon", "legs", "boots", "bound"])
          : new Set(["helmet", "backpack", "armor", "weapon", "shield", "legs", "boots", "bound"]),
      );
      expect(weapon).toBeDefined();
      expect(starterSet.backpackContents).toEqual(
        expect.arrayContaining([
          { typeId: 3043, count: 5 },
          { typeId: 266, count: 5 },
          { typeId: 3003, count: 1 },
          { typeId: 3457, count: 1 },
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

        // The bound slot holds a system container no item type declares.
        if (starterItem.slot === "bound") {
          expect(itemType.containerCapacity ?? 0).toBeGreaterThan(0);
          continue;
        }
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

  it("gives every vocation a loot pouch and an adventurer's stone inside the bound container", () => {
    for (const vocation of STARTER_VOCATIONS) {
      const starterSet = getStarterSet(vocation);

      expect(
        starterSet.equipment.some((item) => item.slot === "bound"),
      ).toBe(true);
      expect(starterSet.boundContents).toEqual([
        { typeId: 23721, count: 1 },
        { typeId: 16277, count: 1 },
      ]);
      expect(catalog.require(23721).name).toBe("loot pouch");
      expect(catalog.require(16277).name).toBe("adventurer's stone");
      expect(catalog.require(16277).movable).toBe(false);
    }
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
