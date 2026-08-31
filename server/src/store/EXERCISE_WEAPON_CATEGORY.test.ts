import { beforeAll, describe, expect, it } from "vitest";
import { getExerciseWeaponDefinition } from "../action/getExerciseWeaponDefinition";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { EXERCISE_WEAPON_CATEGORY } from "./EXERCISE_WEAPON_CATEGORY";
import { STORE_CATEGORIES } from "./storeCatalog";

let catalog: ItemCatalog;

const offers = EXERCISE_WEAPON_CATEGORY.products.flatMap((product) =>
  product.subOffers.map((offer) => ({ product, offer })),
);

describe("EXERCISE_WEAPON_CATEGORY", () => {
  beforeAll(async () => {
    catalog = await loadItemCatalog();
  });

  it("takes the imported shelf's place without moving it in the tree", () => {
    const index = STORE_CATEGORIES.findIndex(
      (category) => category.id === "exercise-weapons",
    );

    expect(STORE_CATEGORIES[index]).toBe(EXERCISE_WEAPON_CATEGORY);
    expect(EXERCISE_WEAPON_CATEGORY.parentId).toBe("consumables");
    expect(
      STORE_CATEGORIES.filter((category) => category.id === "exercise-weapons"),
    ).toHaveLength(1);
  });

  it("stocks the epic and legendary tiers only, and nothing Canary sold", () => {
    expect(offers).toHaveLength(16);
    for (const { offer } of offers) {
      expect(offer.grant.kind).toBe("charges");
      if (offer.grant.kind !== "charges") continue;
      // Every stock tier lives below the ripped appearance range; a shelf that
      // sold one again would put the slow weapons back in the store.
      expect(offer.grant.itemTypeId).toBeGreaterThan(51_950);
    }
    expect(
      offers.map(({ offer }) => offer.price).sort((left, right) => left - right),
    ).toEqual([...Array(8).fill(30), ...Array(8).fill(60)]);
  });

  it("sells charges the item catalog and the trainer both agree on", () => {
    for (const { product, offer } of offers) {
      if (offer.grant.kind !== "charges") continue;
      const type = catalog.require(offer.grant.itemTypeId);
      expect(type.charges).toBe(offer.grant.charges);
      expect(product.name.toLowerCase()).toBe(type.name);
      expect(product.description.en).toContain(`usable ${type.charges} times`);
      expect(product.description["pt-BR"]).toContain(`${type.charges} vezes`);
      expect(
        getExerciseWeaponDefinition(offer.grant.itemTypeId)?.speedMultiplier,
      ).toBe(5);
    }
  });
});
