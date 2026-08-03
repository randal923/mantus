import { describe, expect, it } from "vitest";
import { gridMapData } from "../gridMapData";
import { World } from "../World";
import type { CarriedPersistPlan } from "./CarriedPersistPlan";
import type { Item } from "./Item";
import { restoreUnpersistedOrigins } from "./restoreUnpersistedOrigins";

const CHARACTER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";
const CORPSE_ID = "00000000-0000-4000-8000-0000000000c1";
const GOLD_ID = "00000000-0000-4000-8000-0000000000c2";
const POSITION = { x: 2, y: 2, z: 7 };

function makeWorld(): World {
  return new World(
    gridMapData({ name: "restore-test", width: 8, height: 8, blocked: [] }),
    25,
  );
}

function corpse(): Item {
  return {
    id: CORPSE_ID,
    typeId: 6042,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "world", position: POSITION, stackIndex: 0 },
  };
}

function planFor(item: Item): CarriedPersistPlan {
  return {
    characterId: CHARACTER_ID,
    rowOps: [{ kind: "insert", item }],
    audits: [
      {
        kind: "loot-created",
        itemId: item.id,
        eventId: "death:test-1",
        killerCharacterId: CHARACTER_ID,
        typeId: item.typeId,
        count: item.count,
      },
    ],
  };
}

describe("restoreUnpersistedOrigins", () => {
  it("re-marks a world item whose materializing plan never committed", () => {
    const world = makeWorld();
    const item = corpse();
    world.applyCreatedWorldItems([item]);
    world.registerUnpersistedLootItems([item], {
      eventId: "death:test-1",
      killerCharacterId: CHARACTER_ID,
    });
    // The mutation that planned the insert: applying it clears the origin
    // because the plan was expected to write the row.
    const moved: Item = { ...item, version: 2 };
    world.applyItemMutation({ before: item, after: [moved] });
    expect(world.lootOrigin(CORPSE_ID)).toBeUndefined();

    restoreUnpersistedOrigins(world, planFor(moved));

    expect(world.lootOrigin(CORPSE_ID)).toEqual({
      eventId: "death:test-1",
      killerCharacterId: CHARACTER_ID,
    });
  });

  it("restores a seed origin from the insert that carried it", () => {
    const world = makeWorld();
    const item = corpse();
    const seed = {
      mapName: "restore-test",
      mapVersion: "1",
      x: POSITION.x,
      y: POSITION.y,
      z: POSITION.z,
      stackIndex: 0,
    };
    world.applyCreatedWorldItems([item]);
    world.registerUnpersistedSeedItems([item], seed);
    world.applyItemMutation({ before: item, after: [item] });
    expect(world.seedOrigin(CORPSE_ID)).toBeUndefined();

    restoreUnpersistedOrigins(world, {
      characterId: CHARACTER_ID,
      rowOps: [{ kind: "insert", item, seed }],
      audits: [],
    });

    expect(world.seedOrigin(CORPSE_ID)).toEqual(seed);
  });

  it("leaves items the plan moved out of the world alone", () => {
    const world = makeWorld();
    const looted: Item = {
      id: GOLD_ID,
      typeId: 3031,
      count: 10,
      attributes: {},
      version: 2,
      location: { kind: "container", containerId: CORPSE_ID, slot: 0 },
    };

    // Never in world memory: the resync rebuilds the character's items from
    // committed rows, so marking this one memory-only would strand the entry.
    restoreUnpersistedOrigins(world, planFor(looted));

    expect(world.lootOrigin(GOLD_ID)).toBeUndefined();
  });
});
