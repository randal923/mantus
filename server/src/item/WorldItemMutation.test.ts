import { describe, expect, it } from "vitest";
import { gridMapData } from "../gridMapData";
import { World } from "../World";
import type { Item } from "./Item";

const ITEM_ID = "76085ddd-c280-46c1-af5d-af712eefea3d";
const SEED_KEY = "test:2:2:7:1";
const SOURCE = { x: 2, y: 2, z: 7 } as const;
const DESTINATION = { x: 3, y: 2, z: 7 } as const;

function makeWorld(): World {
  return new World(
    gridMapData({
      name: "test",
      width: 5,
      height: 5,
      blocked: [],
      items: [
        {
          position: SOURCE,
          item: {
            instanceId: SEED_KEY,
            itemId: 3273,
            stackIndex: 1,
            mutable: true,
          },
        },
      ],
    }),
    50,
  );
}

function makeSeededItem(location: Item["location"], version: number): Item {
  return {
    id: ITEM_ID,
    typeId: 3273,
    count: 1,
    attributes: {},
    version,
    location,
    seedKey: SEED_KEY,
  };
}

describe("World item mutations", () => {
  it("hides a picked-up map seed and emits revisioned dynamic tile state", () => {
    const world = makeWorld();
    const before = makeSeededItem(
      { kind: "world", position: SOURCE, stackIndex: 1 },
      1,
    );
    const carried = makeSeededItem(
      { kind: "equipment", characterId: "character", slot: "weapon" },
      2,
    );

    expect(world.getMapItems(SOURCE)).toHaveLength(1);
    expect(world.applyItemMutation({ before, after: [carried] })).toEqual([SOURCE]);
    expect(world.mapItemTileState(SOURCE)).toMatchObject({ revision: 1, items: [] });

    const dropped = makeSeededItem(
      { kind: "world", position: DESTINATION, stackIndex: 0 },
      3,
    );
    expect(world.applyItemMutation({ before: carried, after: [dropped] })).toEqual([
      DESTINATION,
    ]);
    expect(world.mapItemTileState(DESTINATION)).toMatchObject({
      revision: 1,
      items: [
        {
          instanceId: SEED_KEY,
          itemId: 3273,
          revision: 3,
          count: 1,
        },
      ],
    });
  });
});
