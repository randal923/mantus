import { describe, expect, it } from "vitest";
import type { WikiItem } from "./WikiItem";
import { getWikiItemCategory } from "./getWikiItemCategory";

const BASE_ITEM: WikiItem = {
  id: 1,
  name: "item",
  spriteId: 1,
  weight: 0,
};

describe("getWikiItemCategory", () => {
  it("prioritizes equipment slots", () => {
    expect(
      getWikiItemCategory({ ...BASE_ITEM, equipmentSlot: "helmet" }),
    ).toBe("helmets");
  });

  it("groups supported primary types", () => {
    expect(
      getWikiItemCategory({
        ...BASE_ITEM,
        primaryType: "creature products",
      }),
    ).toBe("creatureProducts");
  });

  it("keeps uncategorized collectibles in other", () => {
    expect(getWikiItemCategory(BASE_ITEM)).toBe("other");
  });
});
