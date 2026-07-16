import { describe, expect, it } from "vitest";
import type { Item } from "./Item";
import { MemoryItemStore } from "./MemoryItemStore";

const CHARACTER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";
const ITEM_ID = "434b8502-04e2-4e3b-875d-f9be2153016c";
const BACKPACK_ID = "41868798-fc9b-43ac-bf28-4f52bf64c4eb";
const POUCH_ID = "db85bce3-0fc9-49f4-87ff-dda53f3cc8c1";

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
      ),
      store.moveToContainer(
        CHARACTER_ID,
        ITEM_ID,
        1,
        POUCH_ID,
        1,
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
      ),
    ).rejects.toThrow("cycle");
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
