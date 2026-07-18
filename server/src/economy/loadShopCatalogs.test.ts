import { describe, expect, it } from "vitest";
import { loadShopCatalogs } from "./loadShopCatalogs";

const CANARY_COMMIT = "a879c9312e34381e8eedf397b8ed44510698b689";

describe("loadShopCatalogs", () => {
  it("loads every usable pinned offer without duplicate ids", () => {
    const catalogs = loadShopCatalogs(CANARY_COMMIT);
    const entries = [...catalogs.values()].flatMap((catalog) => catalog.entries);

    expect(catalogs.size).toBe(284);
    expect(entries).toHaveLength(8_368);
    for (const catalog of catalogs.values()) {
      expect(new Set(catalog.entries.map((entry) => entry.offerId)).size).toBe(
        catalog.entries.length,
      );
    }
  });

  it("preserves storage gates, token currencies, and a free Canary offer", () => {
    const catalogs = loadShopCatalogs(CANARY_COMMIT);
    const cledwyn = catalogs.get("cledwyn");
    const simon = catalogs.get("simon-the-beggar");
    const rudolph = catalogs.get("rudolph");

    expect(cledwyn).toMatchObject({
      currencyItemTypeId: 22516,
      currencyName: "silver token",
    });
    expect(
      [...catalogs.values()]
        .flatMap((catalog) => catalog.entries)
        .filter((entry) => entry.availability),
    ).toHaveLength(125);
    expect(simon?.entries).toContainEqual(
      expect.objectContaining({ itemTypeId: 3457, buyPrice: 0 }),
    );
    expect(rudolph?.entries).toHaveLength(9);
  });

  it("preserves charged exercise-weapon subtypes from Canary", () => {
    const sam = loadShopCatalogs(CANARY_COMMIT).get("sam");

    expect(
      sam?.entries.find((entry) => entry.offerId === "item-28552-500"),
    ).toMatchObject({
      itemTypeId: 28552,
      subtype: 500,
      buyPrice: 347_222,
      minimumAmount: 1,
      maximumAmount: 100,
    });
  });
});
