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

/** Dead chicken chain: 6042 -(10s)-> 4330 -(300s)-> 4331 -(300s)-> 4332 -(60s)-> gone. */
const CORPSE_TYPE = 6042;
const CORPSE_STAGE_TWO = 4330;
const CORPSE_STAGE_THREE = 4331;
const CORPSE_FINAL = 4332;
const GOLD_TYPE = 3031;
const POSITION = { x: 2, y: 2, z: 7 };

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

interface Harness {
  readonly world: World;
  readonly store: MemoryItemStore;
  readonly decay: DecayManager;
  readonly items: ItemIntentHandler;
}

function makeHarness(): Harness {
  const world = new World(
    gridMapData({ name: "decay-test", width: 12, height: 12, blocked: [] }),
    25,
  );
  const registry = {
    all: () => [],
    sessionFor: () => undefined,
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const store = new MemoryItemStore(catalog);
  const decay = new DecayManager(catalog);
  const items = new ItemIntentHandler(store, catalog, world, visibility, decay);
  return { world, store, decay, items };
}

async function settle(harness: Harness, now: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  harness.items.applyResolvedOutcomes(now);
}

function mapItemAt(harness: Harness) {
  return harness.world.getMapItems(POSITION);
}

describe("world item decay", () => {
  it("walks a looted corpse through its full decay chain until removal", async () => {
    const harness = makeHarness();
    harness.items.createCorpse(
      "killer-1",
      "death:test-1",
      POSITION,
      0,
      CORPSE_TYPE,
      [{ typeId: GOLD_TYPE, count: 10 }],
    );
    await settle(harness, 0);
    expect(mapItemAt(harness)).toMatchObject([
      { itemId: CORPSE_TYPE, revision: 1 },
    ]);
    expect(harness.decay.scheduledCount).toBe(1);

    harness.items.tickDecay(10_000);
    await settle(harness, 10_000);
    expect(mapItemAt(harness)).toMatchObject([
      { itemId: CORPSE_STAGE_TWO, revision: 2 },
    ]);

    harness.items.tickDecay(310_000);
    await settle(harness, 310_000);
    expect(mapItemAt(harness)).toMatchObject([
      { itemId: CORPSE_STAGE_THREE, revision: 3 },
    ]);

    harness.items.tickDecay(610_000);
    await settle(harness, 610_000);
    expect(mapItemAt(harness)).toMatchObject([
      { itemId: CORPSE_FINAL, revision: 4 },
    ]);

    harness.items.tickDecay(670_000);
    await settle(harness, 670_000);
    expect(mapItemAt(harness)).toEqual([]);
    expect(harness.decay.scheduledCount).toBe(0);
  });

  it("drops a stale decay record instead of touching the replacement item", async () => {
    const harness = makeHarness();
    const corpse: Item = {
      id: "00000000-0000-4000-8000-00000000d001",
      typeId: CORPSE_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "world", position: POSITION, stackIndex: 0 },
    };
    harness.store.seed(corpse);
    harness.world.applyCreatedWorldItems([corpse]);
    harness.items.scheduleWorldDecay([corpse], 0);

    // A concurrent mutation reached the world but not the decay schedule.
    harness.world.applyItemMutation({
      before: corpse,
      after: [{ ...corpse, version: 2 }],
    });

    harness.items.tickDecay(10_000);
    await settle(harness, 10_000);

    expect(mapItemAt(harness)).toMatchObject([
      { itemId: CORPSE_TYPE, revision: 2 },
    ]);
    expect(harness.decay.scheduledCount).toBe(0);
  });

  it("reschedules loaded items after restart and transforms exactly once", async () => {
    const harness = makeHarness();
    const corpse: Item = {
      id: "00000000-0000-4000-8000-00000000d002",
      typeId: CORPSE_TYPE,
      count: 1,
      attributes: { ownerCharacterId: "killer-1" },
      version: 1,
      location: { kind: "world", position: POSITION, stackIndex: 0 },
    };
    harness.store.seed(corpse);
    // GameServer feeds persisted world deltas through this exact path at boot.
    harness.world.applyCreatedWorldItems([corpse]);
    harness.items.scheduleWorldDecay([corpse], 0);

    harness.items.tickDecay(10_000);
    harness.items.tickDecay(10_000);
    await settle(harness, 10_000);

    expect(mapItemAt(harness)).toMatchObject([
      { itemId: CORPSE_STAGE_TWO, revision: 2 },
    ]);
    expect(harness.decay.scheduledCount).toBe(1);
  });

  it("rejects a stale decay transaction at the store", async () => {
    const store = new MemoryItemStore(catalog);
    store.seed({
      id: "00000000-0000-4000-8000-00000000d003",
      typeId: CORPSE_TYPE,
      count: 1,
      attributes: {},
      version: 3,
      location: { kind: "world", position: POSITION, stackIndex: 0 },
    });
    await expect(
      store.decayWorldItem("00000000-0000-4000-8000-00000000d003", 1),
    ).rejects.toThrow("item is missing or stale");
  });

  it("destroys contents the next stage cannot hold and clears loot ownership", async () => {
    const store = new MemoryItemStore(catalog);
    const corpse = (
      await store.createCorpse(
        "killer-1",
        "death:test-2",
        POSITION,
        0,
        CORPSE_STAGE_TWO,
        [
          { typeId: GOLD_TYPE, count: 10 },
          { typeId: GOLD_TYPE, count: 5 },
        ],
      )
    )[0]!;
    expect(corpse.attributes).toEqual({ ownerCharacterId: "killer-1" });

    // 4330 -> 4331 drops container capacity to zero: contents must go with it.
    const mutation = await store.decayWorldItem(corpse.id, corpse.version);
    expect(mutation.after).toMatchObject([
      { id: corpse.id, typeId: CORPSE_STAGE_THREE, attributes: {} },
    ]);
    expect(mutation.removedItemIds).toHaveLength(2);

    const lastStage = await store.decayWorldItem(corpse.id, corpse.version + 1);
    expect(lastStage.after).toMatchObject([{ typeId: CORPSE_FINAL }]);

    const removal = await store.decayWorldItem(corpse.id, corpse.version + 2);
    expect(removal.after).toEqual([]);
    expect(removal.removedItemIds).toEqual([corpse.id]);
  });
});
