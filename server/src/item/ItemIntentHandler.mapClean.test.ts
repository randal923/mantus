import { beforeAll, describe, expect, it } from "vitest";
import { gridMapData } from "../gridMapData";
import type { SessionRegistry } from "../SessionRegistry";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { DecayManager } from "./DecayManager";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { loadItemCatalog } from "./loadItemCatalog";
import { MemoryItemStore } from "./MemoryItemStore";

const GOLD_TYPE = 3031;
const BACKPACK_TYPE = 2854;
const CORPSE_TYPE = 6042;
const POSITION = { x: 2, y: 2, z: 7 };

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function makeHarness() {
  const world = new World(
    gridMapData({ name: "clean-test", width: 12, height: 12, blocked: [] }),
    25,
  );
  const registry = {
    all: () => [],
    sessionFor: () => undefined,
  } as unknown as SessionRegistry;
  const store = new MemoryItemStore(catalog);
  const items = new ItemIntentHandler(
    store,
    catalog,
    world,
    new Visibility(world, registry),
    new DecayManager(catalog),
  );
  return { world, store, items };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("map clean removals", () => {
  it("clears the tile and the rows, contents included", async () => {
    const { world, store, items } = makeHarness();
    const bag: Item = {
      id: "00000000-0000-4000-8000-0000000000b1",
      typeId: BACKPACK_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "world", position: POSITION, stackIndex: 0 },
    };
    const gold: Item = {
      id: "00000000-0000-4000-8000-0000000000b2",
      typeId: GOLD_TYPE,
      count: 20,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: bag.id, slot: 0 },
    };
    store.seed(bag);
    store.seed(gold);
    world.applyCreatedWorldItems([bag, gold]);

    const removed = items.cleanWorldItems([bag], 0);
    await settle();

    expect(removed).toBe(2);
    expect(world.getMapItems(POSITION)).toEqual([]);
    expect(world.getWorldItem(bag.id)).toBeUndefined();
    expect(store.allItems()).toEqual([]);
  });

  it("skips an item that changed since the sweep was collected", async () => {
    const { world, store, items } = makeHarness();
    const gold: Item = {
      id: "00000000-0000-4000-8000-0000000000b3",
      typeId: GOLD_TYPE,
      count: 20,
      attributes: {},
      version: 1,
      location: { kind: "world", position: POSITION, stackIndex: 0 },
    };
    store.seed(gold);
    world.applyCreatedWorldItems([gold]);

    // Someone topped the stack up between collection and execution.
    const stale = { ...gold };
    world.applyItemMutation({ before: gold, after: [{ ...gold, version: 2 }] });

    const removed = items.cleanWorldItems([stale], 0);
    await settle();

    expect(removed).toBe(0);
    expect(world.getWorldItem(gold.id)).toMatchObject({ version: 2 });
    expect(store.allItems().map((item) => item.id)).toEqual([gold.id]);
  });

  it("sweeps memory-only loot that never had a row", async () => {
    const { world, store, items } = makeHarness();
    items.createCorpse(
      "killer-1",
      "death:clean-1",
      POSITION,
      0,
      CORPSE_TYPE,
      [{ typeId: GOLD_TYPE, count: 10 }],
      0,
    );
    items.applyResolvedOutcomes(0);
    const instanceId = world.getMapItems(POSITION)[0]?.instanceId ?? "";
    const corpse = world.getWorldItem(instanceId);
    if (!corpse) throw new Error("corpse was not created");

    const removed = items.cleanWorldItems([corpse], 0);
    await settle();

    expect(removed).toBe(2);
    expect(world.getMapItems(POSITION)).toEqual([]);
    expect(store.allItems()).toEqual([]);
  });
});
