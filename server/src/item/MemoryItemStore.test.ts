import { describe, expect, it } from "vitest";
import type { Item } from "./Item";
import { MemoryItemStore } from "./MemoryItemStore";

const CHARACTER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";
const ITEM_ID = "434b8502-04e2-4e3b-875d-f9be2153016c";

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
});
