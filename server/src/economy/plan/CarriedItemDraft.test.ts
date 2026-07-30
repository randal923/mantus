import { GOLD_COIN_TYPE_ID } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import type { Item } from "../../item/Item";
import { ItemCatalog } from "../../item/ItemCatalog";
import type { ItemType } from "../../item/ItemType";
import { CarriedItemDraft } from "./CarriedItemDraft";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BACKPACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BAG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const BACKPACK = 1988;
const AXE = 3264;
const ROPE = 3003;

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
    containerCapacity: 2,
    weight: 0,
  }),
  makeItemType({ id: AXE, weight: 100 }),
  makeItemType({ id: ROPE, stackable: true, maxCount: 100, weight: 10 }),
  makeItemType({
    id: GOLD_COIN_TYPE_ID,
    stackable: true,
    maxCount: 100,
    weight: 10,
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

const inSlot = (
  id: string,
  typeId: number,
  count: number,
  slot: number,
  containerId = BACKPACK_ID,
): Item => ({
  id,
  typeId,
  count,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId, slot },
});

const draftOf = (items: ReadonlyArray<Item>, capacityMax = 10_000) =>
  new CarriedItemDraft(catalog, CHARACTER_ID, items, capacityMax);

describe("CarriedItemDraft", () => {
  it("frees a destroyed row's slot for a later grant in the same draft", () => {
    // Both slots are taken, so the grant only fits because paying empties one.
    const draft = draftOf([
      backpack,
      inSlot("coins", GOLD_COIN_TYPE_ID, 20, 0),
      inSlot("axe-1", AXE, 1, 1),
    ]);

    expect(draft.destroy(GOLD_COIN_TYPE_ID, 20, "shop-purchase")).toBe(true);
    expect(draft.grantSingles(AXE, 1, "shop-purchase")).toBe(true);

    const built = draft.build();
    expect(built.mutation.removedItemIds).toEqual(["coins"]);
    const granted = built.mutation.after.find((item) => item.typeId === AXE);
    expect(granted?.location).toEqual({
      kind: "container",
      containerId: BACKPACK_ID,
      slot: 0,
    });
  });

  it("tops up an existing stack before opening a new one", () => {
    const draft = draftOf([backpack, inSlot("rope", ROPE, 90, 0)]);

    expect(draft.grantStackable(ROPE, 15, "shop-purchase")).toBe(0);

    const built = draft.build();
    const rope = built.mutation.after.filter((item) => item.typeId === ROPE);
    // 10 top up the existing stack to its 100 limit; 5 open a second stack.
    expect(rope.map((item) => item.count).sort((a, b) => a - b)).toEqual([5, 100]);
  });

  it("reports units that did not fit instead of overflowing the backpack", () => {
    const draft = draftOf([
      backpack,
      inSlot("axe-1", AXE, 1, 0),
      inSlot("axe-2", AXE, 1, 1),
    ]);

    expect(draft.grantStackable(ROPE, 30, "shop-sale")).toBe(30);
  });

  it("descends into nested bags when the backpack itself is full", () => {
    const draft = draftOf([
      backpack,
      { ...inSlot(BAG_ID, BACKPACK, 1, 0), typeId: BACKPACK },
      inSlot("axe-1", AXE, 1, 1),
    ]);

    expect(draft.grantSingles(AXE, 1, "shop-purchase")).toBe(true);
    const granted = draft
      .build()
      .mutation.after.find((item) => item.location.kind === "container");
    expect(granted?.location).toEqual({
      kind: "container",
      containerId: BAG_ID,
      slot: 0,
    });
  });

  it("never consumes an equipped row or a container holding items", () => {
    const equipped: Item = {
      id: "axe-worn",
      typeId: AXE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "equipment", characterId: CHARACTER_ID, slot: "weapon" },
    };
    const bag = inSlot(BAG_ID, BACKPACK, 1, 0);
    const draft = draftOf([
      backpack,
      equipped,
      bag,
      inSlot("rope", ROPE, 1, 0, BAG_ID),
    ]);

    expect(draft.countOf(AXE)).toBe(0);
    expect(draft.countOf(BACKPACK)).toBe(0);
    expect(draft.destroy(AXE, 1, "shop-sale")).toBe(false);
  });

  it("counts weight from the live view as rows come and go", () => {
    const draft = draftOf([backpack, inSlot("coins", GOLD_COIN_TYPE_ID, 10, 0)]);
    expect(draft.usedWeight()).toBe(100);

    draft.destroy(GOLD_COIN_TYPE_ID, 10, "bank-deposit");
    expect(draft.usedWeight()).toBe(0);

    draft.grantSingles(AXE, 1, "shop-purchase");
    expect(draft.usedWeight()).toBe(100);
  });
});
