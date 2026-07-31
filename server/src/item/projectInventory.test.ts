import { describe, expect, it } from "vitest";
import type { Item } from "./Item";
import { ItemCatalog } from "./ItemCatalog";
import type { ItemType } from "./ItemType";
import { projectInventory } from "./projectInventory";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BACKPACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BAG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const BACKPACK = 1988;
const BAG = 1987;
const RUNE = 3155;

const makeItemType = (
  overrides: Partial<ItemType> & { id: number },
): ItemType => ({
  clientId: overrides.id,
  name: `type-${overrides.id}`,
  spriteId: overrides.id,
  stackable: false,
  maxCount: 1,
  weight: 100,
  pickupable: true,
  movable: true,
  light: { intensity: 0, color: 0 },
  elevation: 0,
  render: {
    ground: false,
    groundBorder: false,
    onBottom: false,
    onTop: false,
    stackable: false,
    fluidContainer: false,
    splash: false,
    hangable: false,
    hookSouth: false,
    hookEast: false,
    lyingCorpse: false,
    animateAlways: false,
    topEffect: false,
  },
  ...overrides,
});

const catalog = new ItemCatalog([
  makeItemType({
    id: BACKPACK,
    equipmentSlot: "backpack",
    containerCapacity: 20,
    weight: 0,
  }),
  makeItemType({ id: BAG, containerCapacity: 8, weight: 0 }),
  makeItemType({
    id: RUNE,
    kind: "rune",
    stackable: true,
    maxCount: 100,
    weight: 12,
  }),
]);

const backpack: Item = {
  id: BACKPACK_ID,
  typeId: BACKPACK,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "equipment", characterId: CHARACTER_ID, slot: "backpack" },
};

const bag: Item = {
  id: BAG_ID,
  typeId: BAG,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
};

const runeStack = (id: string, count: number, containerId: string): Item => ({
  id,
  typeId: RUNE,
  count,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId, slot: 1 },
});

describe("projectInventory", () => {
  it("totals a carried type the player cannot currently see", () => {
    // The bag is shut, so its rune reaches the client only through `carried` —
    // which is what keeps the action bar button drawn.
    const state = projectInventory(
      [backpack, bag, runeStack("runes", 7, BAG_ID)],
      catalog,
      10_000,
      1,
      new Set([BACKPACK_ID]),
    );

    expect(state.containers?.map((entry) => entry.container.id)).toEqual([
      BACKPACK_ID,
    ]);
    expect(state.carried).toEqual([
      expect.objectContaining({ typeId: BAG, count: 1 }),
      expect.objectContaining({
        typeId: BACKPACK,
        count: 1,
        equipmentSlot: "backpack",
      }),
      expect.objectContaining({ typeId: RUNE, count: 7, useKind: "rune" }),
    ]);
  });

  it("sums every stack of a type across containers", () => {
    const state = projectInventory(
      [
        backpack,
        bag,
        runeStack("open", 40, BACKPACK_ID),
        runeStack("closed", 60, BAG_ID),
      ],
      catalog,
      10_000,
      1,
    );

    expect(
      state.carried?.find((entry) => entry.typeId === RUNE)?.count,
    ).toBe(100);
  });
});
