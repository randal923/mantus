import { beforeAll, describe, expect, it } from "vitest";
import type { Item } from "../Item";
import { ItemCatalog } from "../ItemCatalog";
import { loadItemCatalog } from "../loadItemCatalog";
import { planUnequip } from "./planUnequip";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BACKPACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WEAPON_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OCCUPANT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

  it("atomically shifts an occupied backpack when unequipping to the front", () => {
    const weapon: Item = {
      id: WEAPON_ID,
      typeId: 3274,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "equipment",
        characterId: CHARACTER_ID,
        slot: "weapon",
      },
    };
    const occupant: Item = {
      id: OCCUPANT_ID,
      typeId: 3031,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    };
    const plan = planUnequip({
      characterId: CHARACTER_ID,
      catalog,
      items: [backpack, weapon, occupant],
      itemId: WEAPON_ID,
      expectedVersion: 1,
      slot: "weapon",
      destination: {
        containerId: BACKPACK_ID,
        containerRevision: 1,
        slot: 0,
        placement: "front",
      },
    });
    if (!plan) throw new Error("plan was rejected");

    expect(plan.mutation.after.find((item) => item.id === WEAPON_ID)).toMatchObject({
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    });
    expect(plan.mutation.after.find((item) => item.id === OCCUPANT_ID)).toMatchObject({
      location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
    });
  });
});
