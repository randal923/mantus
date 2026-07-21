import { describe, expect, it } from "vitest";
import type { Item } from "./Item";
import { MemoryItemStore } from "./MemoryItemStore";

const CHARACTER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";
const ITEM_ID = "434b8502-04e2-4e3b-875d-f9be2153016c";
const BACKPACK_ID = "41868798-fc9b-43ac-bf28-4f52bf64c4eb";
const POUCH_ID = "db85bce3-0fc9-49f4-87ff-dda53f3cc8c1";
const POTION_ID = "9845c623-b959-4be1-a3da-5b93e83d61d1";

function makeInventoryItem(): Item {
  return {
    id: ITEM_ID,
    typeId: 3273,
    count: 1,
    attributes: {},
    version: 1,
    location: {
      kind: "inventory",
      characterId: CHARACTER_ID,
      slot: 0,
    },
  };
}

describe("MemoryItemStore", () => {
  it("allows exactly one concurrent move of the same item", async () => {
    const store = new MemoryItemStore();
    store.seed(makeInventoryItem());

    const results = await Promise.allSettled([
      store.equip(CHARACTER_ID, ITEM_ID, 1, "weapon"),
      store.equip(CHARACTER_ID, ITEM_ID, 1, "weapon"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(store.loadForCharacter(CHARACTER_ID)).resolves.toEqual([
      expect.objectContaining({
        id: ITEM_ID,
        version: 2,
        location: {
          kind: "equipment",
          characterId: CHARACTER_ID,
          slot: "weapon",
        },
      }),
    ]);
  });

  it("rejects replayed revisions without changing the durable item", async () => {
    const store = new MemoryItemStore();
    store.seed(makeInventoryItem());
    await store.equip(CHARACTER_ID, ITEM_ID, 1, "weapon");

    await expect(
      store.unequip(CHARACTER_ID, ITEM_ID, 1, "weapon"),
    ).rejects.toThrow("stale");
    await expect(store.loadForCharacter(CHARACTER_ID)).resolves.toEqual([
      expect.objectContaining({
        id: ITEM_ID,
        version: 2,
        location: expect.objectContaining({ kind: "equipment" }),
      }),
    ]);
  });

  it("allows exactly one concurrent combat consumption of a revision", async () => {
    const store = new MemoryItemStore();
    store.seed({ ...makeInventoryItem(), count: 2 });

    const results = await Promise.allSettled([
      store.consume(CHARACTER_ID, ITEM_ID, 1, 1, "rune"),
      store.consume(CHARACTER_ID, ITEM_ID, 1, 1, "rune"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(store.loadForCharacter(CHARACTER_ID)).resolves.toEqual([
      expect.objectContaining({ id: ITEM_ID, count: 1, version: 2 }),
    ]);
  });

  it("atomically restores a character and returns exactly one flask under replay", async () => {
    const store = new MemoryItemStore();
    const potion: Item = {
      id: POTION_ID,
      typeId: 266,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "inventory",
        characterId: CHARACTER_ID,
        slot: 0,
      },
    };
    store.seed(potion);
    const flask: Item = {
      ...potion,
      typeId: 285,
      attributes: {},
      version: 2,
    };
    const request = {
      actorCharacterId: CHARACTER_ID,
      targetCharacterId: CHARACTER_ID,
      itemPlan: { kind: "transform", before: potion, flaskAfter: flask },
      expectedTargetCharacterVersion: 1,
      expectedTargetHealth: 100,
      expectedTargetMana: 50,
      targetMaxHealth: 500,
      targetMaxMana: 100,
      healthRestore: 150,
      manaRestore: 0,
    } as const;

    const results = await Promise.allSettled([
      store.usePotion(request),
      store.usePotion(request),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(store.loadForCharacter(CHARACTER_ID)).resolves.toEqual([
      expect.objectContaining({
        id: POTION_ID,
        typeId: 285,
        count: 1,
        version: 2,
      }),
    ]);
  });

  it("allows exactly one concurrent generic container move", async () => {
    const store = new MemoryItemStore();
    store.seed(makeInventoryItem());
    store.seed({
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
    });
    store.seed({
      id: POUCH_ID,
      typeId: 2853,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 0,
      },
    });

    const results = await Promise.allSettled([
      store.moveToContainer(
        CHARACTER_ID,
        ITEM_ID,
        1,
        POUCH_ID,
        1,
        0,
      ),
      store.moveToContainer(
        CHARACTER_ID,
        ITEM_ID,
        1,
        POUCH_ID,
        1,
        0,
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(store.loadForCharacter(CHARACTER_ID)).resolves.toContainEqual(
      expect.objectContaining({
        id: ITEM_ID,
        version: 2,
        location: {
          kind: "container",
          containerId: POUCH_ID,
          slot: 0,
        },
      }),
    );
  });

  it("rejects moving a container into its own descendant", async () => {
    const store = new MemoryItemStore();
    store.seed({
      id: BACKPACK_ID,
      typeId: 2854,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "inventory",
        characterId: CHARACTER_ID,
        slot: 0,
      },
    });
    store.seed({
      id: POUCH_ID,
      typeId: 2853,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 0,
      },
    });

    await expect(
      store.moveToContainer(
        CHARACTER_ID,
        BACKPACK_ID,
        1,
        POUCH_ID,
        1,
        0,
      ),
    ).rejects.toThrow("cycle");
  });

  it("atomically swaps two occupied slots in the same container", async () => {
    const store = new MemoryItemStore();
    store.seed({
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
    });
    store.seed({
      ...makeInventoryItem(),
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    });
    store.seed({
      id: POUCH_ID,
      typeId: 2853,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
    });

    await expect(
      store.moveToContainer(
        CHARACTER_ID,
        ITEM_ID,
        1,
        BACKPACK_ID,
        1,
        1,
      ),
    ).resolves.toMatchObject({
      after: [
        { id: ITEM_ID, version: 2, location: { slot: 1 } },
        { id: POUCH_ID, version: 2, location: { slot: 0 } },
      ],
    });
    await expect(store.loadForCharacter(CHARACTER_ID)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ITEM_ID,
          location: expect.objectContaining({ slot: 1 }),
        }),
        expect.objectContaining({
          id: POUCH_ID,
          location: expect.objectContaining({ slot: 0 }),
        }),
      ]),
    );
  });

  it("atomically swaps replacement equipment into the source slot", async () => {
    const store = new MemoryItemStore();
    store.seed(makeInventoryItem());
    store.seed({
      id: POUCH_ID,
      typeId: 3273,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "equipment",
        characterId: CHARACTER_ID,
        slot: "weapon",
      },
    });

    await expect(
      store.equip(CHARACTER_ID, ITEM_ID, 1, "weapon"),
    ).resolves.toMatchObject({
      after: [
        { id: ITEM_ID, location: { kind: "equipment", slot: "weapon" } },
        { id: POUCH_ID, location: { kind: "inventory", slot: 0 } },
      ],
    });
  });

  it("atomically consumes a conjuring source and creates the result", async () => {
    const store = new MemoryItemStore();
    store.seed({
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
    });
    store.seed({
      id: ITEM_ID,
      typeId: 3147,
      count: 2,
      attributes: {},
      version: 1,
      location: {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 0,
      },
    });

    const result = await store.conjure(
      CHARACTER_ID,
      1,
      100,
      10,
      50,
      1,
      3147,
      3155,
      3,
    );

    expect(result.characterVersion).toBe(2);
    await expect(
      store.conjure(
        CHARACTER_ID,
        1,
        100,
        10,
        50,
        1,
        3147,
        3155,
        3,
      ),
    ).rejects.toThrow("stale");
    await expect(store.loadForCharacter(CHARACTER_ID)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ITEM_ID,
          typeId: 3147,
          count: 1,
          version: 2,
        }),
        expect.objectContaining({
          typeId: 3155,
          count: 3,
          version: 1,
        }),
      ]),
    );
  });
});
