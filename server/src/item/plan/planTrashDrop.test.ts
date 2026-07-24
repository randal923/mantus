import { describe, expect, it } from "vitest";
import type { Item } from "../Item";
import { planTrashDrop } from "./planTrashDrop";

const CHARACTER_ID = "11111111-1111-1111-1111-111111111111";
const POSITION = { x: 5, y: 5, z: 7 };

const stack = (count: number): Item => ({
  id: "gold-1",
  typeId: 3031,
  count,
  attributes: {},
  version: 4,
  location: { kind: "container", containerId: "bp", slot: 0 },
});

describe("planTrashDrop", () => {
  it("destroys a whole item with exactly one destruction audit and a poff", () => {
    const item = stack(10);
    const plan = planTrashDrop({
      characterId: CHARACTER_ID,
      carriedItems: [item],
      item,
      count: 10,
      position: POSITION,
    });

    expect(plan.mutation).toEqual({
      before: item,
      after: [],
      removedItemIds: [item.id],
    });
    expect(plan.persist.rowOps).toEqual([
      { kind: "delete", itemId: item.id, expectedVersion: 4 },
    ]);
    expect(plan.persist.audits).toEqual([
      {
        kind: "destruction",
        itemId: item.id,
        typeId: 3031,
        count: 10,
        reason: "trash",
      },
    ]);
    expect(plan.effect).toEqual({ position: POSITION, effectId: 3 });
  });

  it("reduces the source and audits only the destroyed count on a partial drop", () => {
    const item = stack(10);
    const plan = planTrashDrop({
      characterId: CHARACTER_ID,
      carriedItems: [item],
      item,
      count: 3,
      position: POSITION,
    });

    expect(plan.mutation.after).toEqual([
      { ...item, count: 7, version: 5 },
    ]);
    expect(plan.mutation.removedItemIds).toBeUndefined();
    expect(plan.persist.rowOps).toEqual([
      { kind: "write", expectedVersion: 4, item: { ...item, count: 7, version: 5 } },
    ]);
    expect(plan.persist.audits).toEqual([
      {
        kind: "destruction",
        itemId: item.id,
        typeId: 3031,
        count: 3,
        reason: "trash",
      },
    ]);
  });

  it("deletes a container's nested subtree leaf-first", () => {
    const backpack: Item = {
      id: "bp",
      typeId: 2854,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: "outer", slot: 0 },
    };
    const inner: Item = {
      id: "inner",
      typeId: 2853,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: "bp", slot: 0 },
    };
    const coin: Item = {
      id: "coin",
      typeId: 3031,
      count: 5,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: "inner", slot: 0 },
    };
    const plan = planTrashDrop({
      characterId: CHARACTER_ID,
      carriedItems: [backpack, inner, coin],
      item: backpack,
      count: 1,
      position: POSITION,
    });

    // Deepest child first, root last (RESTRICT container FK).
    expect(plan.persist.rowOps.map((op) => op.kind)).toEqual([
      "delete",
      "delete",
      "delete",
    ]);
    expect(
      plan.persist.rowOps.map((op) =>
        op.kind === "delete" ? op.itemId : null,
      ),
    ).toEqual(["coin", "inner", "bp"]);
    expect(plan.mutation.removedItemIds).toEqual(["bp", "inner", "coin"]);
    expect(plan.persist.audits).toHaveLength(3);
  });
});
