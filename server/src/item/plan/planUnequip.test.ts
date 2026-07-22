import { describe, expect, it } from "vitest";
import type { Item } from "../Item";
import { ItemCatalog } from "../ItemCatalog";
import { planUnequip } from "./planUnequip";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BACKPACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const backpack: Item = {
  id: BACKPACK_ID,
  typeId: 2854,
  count: 1,
  attributes: {},
  version: 1,
  location: {
    kind: "equipment",
    characterId: CHARACTER_ID,
    slot: "backpack",
  },
};

describe("planUnequip", () => {
  it("rejects an equipped backpack with or without a forged destination", () => {
    const input = {
      characterId: CHARACTER_ID,
      catalog: new ItemCatalog([]),
      items: [backpack],
      itemId: BACKPACK_ID,
      expectedVersion: 1,
      slot: "backpack" as const,
    };

    expect(planUnequip(input)).toBeNull();
    expect(
      planUnequip({
        ...input,
        destination: {
          containerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          containerRevision: 1,
          slot: 0,
        },
      }),
    ).toBeNull();
  });
});
