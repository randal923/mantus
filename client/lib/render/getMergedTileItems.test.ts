import { describe, expect, it } from "vitest";
import { createRenderTestObject } from "./createRenderTestObject";
import { getMergedTileItems } from "./getMergedTileItems";

describe("getMergedTileItems", () => {
  it("reconstructs static source positions around server-owned items", () => {
    const objects = new Map([
      [100, createRenderTestObject({ clientId: 100 })],
      [200, createRenderTestObject({ clientId: 200 })],
      [300, createRenderTestObject({ clientId: 300 })],
    ]);
    const merged = getMergedTileItems(
      [100, 300],
      [
        {
          instanceId: "dynamic",
          itemId: 200,
          stackIndex: 1,
          revision: 1,
          count: 1,
        },
      ],
      (itemId) => {
        const object = objects.get(itemId);
        if (!object) throw new Error("missing fixture appearance");
        return object;
      },
      "static",
    );

    expect(
      merged.map(({ instanceId, stackIndex, object }) => ({
        instanceId,
        stackIndex,
        itemId: object.clientId,
      })),
    ).toEqual([
      { instanceId: "static:static:0:100", stackIndex: 0, itemId: 100 },
      { instanceId: "dynamic", stackIndex: 1, itemId: 200 },
      { instanceId: "static:static:1:300", stackIndex: 2, itemId: 300 },
    ]);
  });

  it("drops duplicate untrusted dynamic stack positions deterministically", () => {
    const object = createRenderTestObject();
    const merged = getMergedTileItems(
      [],
      [
        {
          instanceId: "first",
          itemId: 100,
          stackIndex: 1,
          revision: 1,
          count: 1,
        },
        {
          instanceId: "duplicate",
          itemId: 100,
          stackIndex: 1,
          revision: 1,
          count: 1,
        },
      ],
      () => object,
      "static",
    );
    expect(merged.map(({ instanceId }) => instanceId)).toEqual(["first"]);
  });
});
