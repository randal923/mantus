import { describe, expect, it } from "vitest";
import { parseWikiItemCatalog } from "./parseWikiItemCatalog";

describe("parseWikiItemCatalog", () => {
  it("accepts the bounded public item projection", () => {
    expect(
      parseWikiItemCatalog({
        formatVersion: 1,
        items: [
          {
            id: 3079,
            name: "boots of haste",
            spriteId: 1577,
            weight: 750,
            equipmentSlot: "boots",
            speed: 40,
            requirements: { level: 20, vocations: ["Knight"] },
          },
        ],
      }),
    ).toHaveLength(1);
  });

  it("rejects malformed entries instead of trusting the fetched asset", () => {
    expect(() =>
      parseWikiItemCatalog({
        formatVersion: 1,
        items: [{ id: -1, name: "invalid", spriteId: 1, weight: 0 }],
      }),
    ).toThrow("invalid wiki item catalog");
  });
});
