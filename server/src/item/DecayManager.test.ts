import { beforeAll, describe, expect, it } from "vitest";
import { DecayManager } from "./DecayManager";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { loadItemCatalog } from "./loadItemCatalog";

/** Dead chicken chain: 6042 -(10s)-> 4330 -(300s)-> 4331 -(300s)-> 4332 -(60s)-> gone. */
const CORPSE_TYPE = 6042;
const GOLD_TYPE = 3031;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function worldItem(
  id: string,
  typeId: number,
  version = 1,
  stackIndex = 0,
): Item {
  return {
    id,
    typeId,
    count: 1,
    attributes: {},
    version,
    location: {
      kind: "world",
      position: { x: 2, y: 2, z: 7 },
      stackIndex,
    },
  };
}

describe("DecayManager", () => {
  it("schedules only world items with decay metadata", () => {
    const decay = new DecayManager(catalog);
    decay.observeCreated(
      [
        worldItem("corpse", CORPSE_TYPE),
        worldItem("gold", GOLD_TYPE),
        {
          ...worldItem("contained", CORPSE_TYPE),
          location: { kind: "corpse", containerId: "corpse", slot: 0 },
        },
      ],
      0,
    );
    expect(decay.scheduledCount).toBe(1);
    expect(decay.collectDue(9_999)).toEqual([]);
    expect(decay.collectDue(10_000)).toMatchObject([
      { itemId: "corpse", typeId: CORPSE_TYPE, version: 1 },
    ]);
    expect(decay.scheduledCount).toBe(0);
  });

  it("resets the deadline when the item mutates and drops removed items", () => {
    const decay = new DecayManager(catalog);
    decay.observeCreated([worldItem("corpse", CORPSE_TYPE)], 0);
    decay.observeMutation(
      {
        before: worldItem("corpse", CORPSE_TYPE),
        after: [worldItem("corpse", CORPSE_TYPE, 2)],
      },
      8_000,
    );
    expect(decay.collectDue(10_000)).toEqual([]);
    expect(decay.collectDue(18_000)).toMatchObject([
      { itemId: "corpse", version: 2 },
    ]);

    decay.observeCreated([worldItem("corpse", CORPSE_TYPE, 3)], 20_000);
    decay.observeMutation(
      { after: [], removedItemIds: ["corpse"] },
      21_000,
    );
    expect(decay.scheduledCount).toBe(0);
  });

  it("bounds due work per tick", () => {
    const decay = new DecayManager(catalog, 2);
    decay.observeCreated(
      [
        worldItem("a", CORPSE_TYPE, 1, 0),
        worldItem("b", CORPSE_TYPE, 1, 1),
        worldItem("c", CORPSE_TYPE, 1, 2),
      ],
      0,
    );
    expect(decay.collectDue(60_000)).toHaveLength(2);
    expect(decay.collectDue(60_000)).toHaveLength(1);
    expect(decay.collectDue(60_000)).toEqual([]);
  });

  it("never lets a failed record clobber a fresher schedule", () => {
    const decay = new DecayManager(catalog);
    decay.observeCreated([worldItem("corpse", CORPSE_TYPE)], 0);
    const [stale] = decay.collectDue(10_000);
    expect(stale).toBeDefined();

    decay.observeCreated([worldItem("corpse", CORPSE_TYPE, 2)], 10_000);
    decay.restore(stale!, 11_000);
    expect(decay.collectDue(20_000)).toMatchObject([{ version: 2 }]);

    decay.restore(stale!, 21_000);
    expect(decay.collectDue(31_000)).toMatchObject([{ version: 1 }]);
  });
  it("resumes a loaded deadline from the persisted row's age, not a full duration", () => {
    const decay = new DecayManager(catalog);
    const bootAt = 1_000_000;
    // The corpse row was written 4s ago; 6s of its 10s duration remain.
    decay.observeLoaded(
      [worldItem("corpse", CORPSE_TYPE)],
      new Map([["corpse", 4_000]]),
      bootAt,
    );

    expect(decay.collectDue(bootAt + 5_999)).toEqual([]);
    expect(decay.collectDue(bootAt + 6_000)).toMatchObject([
      { itemId: "corpse", version: 1 },
    ]);
    expect(decay.scheduledCount).toBe(0);
  });

  it("makes a loaded item whose duration elapsed while down due immediately, once", () => {
    const decay = new DecayManager(catalog);
    const bootAt = 1_000_000;
    // Down for an hour: the 10s duration lapsed long ago.
    decay.observeLoaded(
      [worldItem("corpse", CORPSE_TYPE)],
      new Map([["corpse", 3_600_000]]),
      bootAt,
    );

    expect(decay.collectDue(bootAt)).toMatchObject([{ itemId: "corpse" }]);
    // Collected records leave the schedule, so a second tick cannot re-run it.
    expect(decay.collectDue(bootAt)).toEqual([]);
    expect(decay.scheduledCount).toBe(0);
  });

  it("falls back to a full duration when a loaded item has no recorded age", () => {
    const decay = new DecayManager(catalog);
    const bootAt = 1_000_000;
    decay.observeLoaded([worldItem("corpse", CORPSE_TYPE)], new Map(), bootAt);

    expect(decay.collectDue(bootAt + 9_999)).toEqual([]);
    expect(decay.collectDue(bootAt + 10_000)).toHaveLength(1);
  });

  it("ignores a nonsensical negative age rather than arming the future", () => {
    const decay = new DecayManager(catalog);
    const bootAt = 1_000_000;
    decay.observeLoaded(
      [worldItem("corpse", CORPSE_TYPE)],
      new Map([["corpse", -60_000]]),
      bootAt,
    );

    expect(decay.collectDue(bootAt + 10_000)).toHaveLength(1);
  });
});
