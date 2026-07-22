import { beforeAll, describe, expect, it } from "vitest";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import { loadItemCatalog } from "../loadItemCatalog";
import { planPotionUse } from "./planPotionUse";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BACKPACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

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

const potion: Item = {
  id: POTION_ID,
  typeId: 266,
  count: 2,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
};

const filler = (slot: number): Item => ({
  id: `dddddddd-dddd-4ddd-8ddd-${String(slot).padStart(12, "0")}`,
  typeId: 3355,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: BACKPACK_ID, slot },
});

describe("planPotionUse", () => {
  it("creates the returned flask in the equipped backpack", () => {
    const plan = planPotionUse({
      characterId: CHARACTER_ID,
      catalog,
      items: [backpack, potion, ...Array.from({ length: 18 }, (_, i) => filler(i + 1))],
      itemId: POTION_ID,
      expectedVersion: 1,
    });

    expect(plan?.itemPlan).toMatchObject({
      kind: "create",
      flaskAfter: {
        location: { kind: "container", containerId: BACKPACK_ID, slot: 19 },
      },
    });
  });

  it("rejects the use when a new flask has no backpack slot", () => {
    const plan = planPotionUse({
      characterId: CHARACTER_ID,
      catalog,
      items: [backpack, potion, ...Array.from({ length: 19 }, (_, i) => filler(i + 1))],
      itemId: POTION_ID,
      expectedVersion: 1,
    });

    expect(plan).toBeNull();
  });
});
