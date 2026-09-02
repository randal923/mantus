import { describe, expect, it } from "vitest";
import type { Item } from "../item/Item";
import { ItemCatalog } from "../item/ItemCatalog";
import type { ItemType } from "../item/ItemType";
import { findQuiverAmmunition } from "./findQuiverAmmunition";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUIVER_ID = "11111111-1111-4111-8111-111111111111";
const BACKPACK_ID = "22222222-2222-4222-8222-222222222222";

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

const QUIVER = 1;
const SHIELD = 2;
const BACKPACK = 3;
const ARROW = 4;
const BOLT = 5;
const APPLE = 6;

const catalog = new ItemCatalog([
  makeItemType({
    id: QUIVER,
    equipmentSlot: "shield",
    primaryType: "quivers",
    containerCapacity: 6,
  }),
  makeItemType({ id: SHIELD, equipmentSlot: "shield", weaponType: "shield" }),
  makeItemType({ id: BACKPACK, equipmentSlot: "backpack", containerCapacity: 20 }),
  makeItemType({
    id: ARROW,
    stackable: true,
    maxCount: 100,
    weaponType: "ammunition",
    ammoType: "arrow",
  }),
  makeItemType({
    id: BOLT,
    stackable: true,
    maxCount: 100,
    weaponType: "ammunition",
    ammoType: "bolt",
  }),
  makeItemType({ id: APPLE }),
]);

const shieldHand = (typeId: number): Item => ({
  id: QUIVER_ID,
  typeId,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "equipment", characterId: CHARACTER_ID, slot: "shield" },
});

const inside = (
  id: string,
  typeId: number,
  containerId: string,
  slot: number,
  count = 1,
): Item => ({
  id,
  typeId,
  count,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId, slot },
});

describe("findQuiverAmmunition", () => {
  it("returns the lowest-slot matching stack inside the equipped quiver", () => {
    const items = [
      shieldHand(QUIVER),
      inside("a", APPLE, QUIVER_ID, 0),
      inside("b", BOLT, QUIVER_ID, 1, 20),
      inside("c", ARROW, QUIVER_ID, 3, 50),
      inside("d", ARROW, QUIVER_ID, 2, 7),
    ];
    expect(findQuiverAmmunition(items, catalog, "arrow")?.item.id).toBe("d");
    expect(findQuiverAmmunition(items, catalog, "bolt")?.item.id).toBe("b");
  });

  it("ignores ammunition outside the quiver", () => {
    const items = [
      shieldHand(QUIVER),
      inside("a", ARROW, BACKPACK_ID, 0, 50),
    ];
    expect(findQuiverAmmunition(items, catalog, "arrow")).toBeNull();
  });

  it("ignores a real shield even when it somehow holds items", () => {
    const items = [shieldHand(SHIELD), inside("a", ARROW, QUIVER_ID, 0, 50)];
    expect(findQuiverAmmunition(items, catalog, "arrow")).toBeNull();
  });
});
