import { describe, expect, it } from "vitest";
import type { Item } from "../Item";
import { ItemCatalog } from "../ItemCatalog";
import type { ItemType } from "../ItemType";
import { planEquip } from "./planEquip";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

const SWORD = 100;
const GATED_SWORD = 101;
const TWO_HANDER = 102;
const SHIELD = 103;
const BACKPACK = 104;
const CARRIED_CONTAINER_ID = "44444444-4444-4444-8444-444444444444";

const catalog = new ItemCatalog([
  makeItemType({ id: SWORD, equipmentSlot: "weapon" }),
  makeItemType({
    id: GATED_SWORD,
    equipmentSlot: "weapon",
    requirements: { level: 30, vocations: ["Knight"] },
  }),
  makeItemType({
    id: TWO_HANDER,
    equipmentSlot: "weapon",
    slotType: "two-handed",
  }),
  makeItemType({ id: SHIELD, equipmentSlot: "shield" }),
  makeItemType({ id: BACKPACK, equipmentSlot: "backpack", containerCapacity: 20 }),
]);

const carried = (typeId: number, slot = 0): Item => ({
  id: `11111111-1111-4111-8111-1111111111${String(typeId).padStart(2, "0")}`,
  typeId,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: CARRIED_CONTAINER_ID, slot },
});

const sourceContainer: Item = {
  id: CARRIED_CONTAINER_ID,
  typeId: BACKPACK,
  count: 1,
  attributes: {},
  version: 1,
  location: {
    kind: "equipment",
    characterId: CHARACTER_ID,
    slot: "backpack",
  },
};

const equipped = (typeId: number, slot: "weapon" | "shield"): Item => ({
  id: `22222222-2222-4222-8222-2222222222${String(typeId).padStart(2, "0")}`,
  typeId,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "equipment", characterId: CHARACTER_ID, slot },
});

describe("planEquip", () => {
  it("rejects equipping below the level requirement", () => {
    const item = carried(GATED_SWORD);
    const plan = planEquip({
      characterId: CHARACTER_ID,
      catalog,
      items: [item],
      level: 10,
      vocation: "Knight",
      itemId: item.id,
      expectedVersion: 1,
      slot: "weapon",
    });
    expect(plan).toBeNull();
  });

  it("rejects equipping with the wrong vocation", () => {
    const item = carried(GATED_SWORD);
    const plan = planEquip({
      characterId: CHARACTER_ID,
      catalog,
      items: [item],
      level: 50,
      vocation: "Druid",
      itemId: item.id,
      expectedVersion: 1,
      slot: "weapon",
    });
    expect(plan).toBeNull();
  });

  it("rejects a two-handed weapon while a shield is equipped", () => {
    const weapon = carried(TWO_HANDER);
    const shield = equipped(SHIELD, "shield");
    const plan = planEquip({
      characterId: CHARACTER_ID,
      catalog,
      items: [weapon, shield],
      level: 50,
      vocation: "Knight",
      itemId: weapon.id,
      expectedVersion: 1,
      slot: "weapon",
    });
    expect(plan).toBeNull();
  });

  it("rejects a shield while a two-handed weapon is equipped", () => {
    const shield = carried(SHIELD);
    const weapon = equipped(TWO_HANDER, "weapon");
    const plan = planEquip({
      characterId: CHARACTER_ID,
      catalog,
      items: [shield, weapon],
      level: 50,
      vocation: "Knight",
      itemId: shield.id,
      expectedVersion: 1,
      slot: "shield",
    });
    expect(plan).toBeNull();
  });

  it("displaces the occupying weapon into the source slot", () => {
    const incoming = carried(SWORD, 4);
    const occupying = equipped(SWORD, "weapon");
    const plan = planEquip({
      characterId: CHARACTER_ID,
      catalog,
      items: [sourceContainer, incoming, occupying],
      level: 50,
      vocation: "Knight",
      itemId: incoming.id,
      expectedVersion: 1,
      slot: "weapon",
    });
    if (!plan) throw new Error("plan was rejected");
    expect(plan.mutation.after).toHaveLength(2);
    const [after, displaced] = plan.mutation.after;
    expect(after).toMatchObject({
      id: incoming.id,
      version: 2,
      location: { kind: "equipment", slot: "weapon" },
    });
    expect(displaced).toMatchObject({
      id: occupying.id,
      version: 2,
      location: {
        kind: "container",
        containerId: CARRIED_CONTAINER_ID,
        slot: 4,
      },
    });
    // The staged write, the equip, then the displaced item's final placement.
    expect(plan.persist.rowOps).toHaveLength(3);
  });

  it("rejects replacing the equipped backpack", () => {
    const incoming = carried(BACKPACK, 4);
    const occupying: Item = {
      id: "33333333-3333-4333-8333-333333333333",
      typeId: BACKPACK,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "equipment",
        characterId: CHARACTER_ID,
        slot: "backpack",
      },
    };

    expect(
      planEquip({
        characterId: CHARACTER_ID,
        catalog,
        items: [incoming, occupying],
        level: 50,
        vocation: "Knight",
        itemId: incoming.id,
        expectedVersion: 1,
        slot: "backpack",
      }),
    ).toBeNull();
  });
});
