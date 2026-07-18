import { describe, expect, it } from "vitest";
import type {
  DepotItemEntry,
  DepotStateMessage,
  InventoryItem,
  StashEntry,
} from "@tibia/protocol";
import { applyDepotPrediction } from "./applyDepotPrediction";

const ITEM_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_ITEM_ID = "00000000-0000-4000-8000-000000000002";

const INVENTORY_ITEM: InventoryItem = {
  id: ITEM_ID,
  typeId: 100,
  clientId: 100,
  spriteId: 100,
  name: "health potion",
  stackable: true,
  maxCount: 100,
  stowable: true,
  count: 20,
  revision: 3,
  tooltip: {
    name: "health potion",
    typeLine: "Item",
    spriteId: 100,
    affixes: [],
    weight: 180,
  },
};

const DEPOT_ITEM: DepotItemEntry = {
  location: "depot",
  slot: 5,
  itemId: ITEM_ID,
  itemTypeId: 100,
  clientId: 100,
  spriteId: 100,
  name: "health potion",
  stackable: true,
  maxCount: 100,
  weight: 180,
  stowable: true,
  count: 20,
  revision: 4,
  containedItemCount: 0,
};

const STASH_ITEM: StashEntry = {
  location: "stash",
  itemTypeId: 100,
  clientId: 100,
  spriteId: 100,
  name: "health potion",
  stackable: true,
  maxCount: 100,
  weight: 180,
  stowable: true,
  count: 50,
};

const makeState = (
  overrides: Partial<DepotStateMessage> = {},
): DepotStateMessage => ({
  type: "depot-state",
  sessionId: "00000000-0000-4000-8000-000000000010",
  depotId: 1,
  townName: "Thais",
  depotRevision: 1,
  inboxRevision: 1,
  stashRevision: 1,
  depotCount: 2,
  inboxCount: 0,
  stashCount: 1,
  depotCapacity: 2_000,
  inboxCapacity: 2_000,
  location: "depot",
  query: "",
  page: 1,
  pageCount: 1,
  entries: [],
  ...overrides,
});

describe("applyDepotPrediction", () => {
  it("shows an inventory deposit in the open depot page", () => {
    const next = applyDepotPrediction(makeState(), {
      kind: "deposit",
      item: INVENTORY_ITEM,
    });

    expect(next.depotCount).toBe(3);
    expect(next.entries).toMatchObject([
      {
        location: "depot",
        itemId: ITEM_ID,
        count: 20,
        revision: 4,
      },
    ]);
  });

  it("keeps later queued deposits projected after the first confirmation", () => {
    const secondItem: InventoryItem = {
      ...INVENTORY_ITEM,
      id: SECOND_ITEM_ID,
      typeId: 101,
      clientId: 101,
      spriteId: 101,
      name: "mana potion",
      tooltip: {
        ...INVENTORY_ITEM.tooltip,
        name: "mana potion",
        spriteId: 101,
      },
    };
    const firstProjection = applyDepotPrediction(makeState(), {
      kind: "deposit",
      item: INVENTORY_ITEM,
    });
    const queuedProjection = applyDepotPrediction(firstProjection, {
      kind: "deposit",
      item: secondItem,
    });
    const confirmedFirst = makeState({
      depotRevision: 2,
      depotCount: 3,
      entries: [DEPOT_ITEM],
    });
    const rebasedProjection = applyDepotPrediction(confirmedFirst, {
      kind: "deposit",
      item: secondItem,
    });

    expect(queuedProjection.depotCount).toBe(4);
    expect(queuedProjection.entries.map((entry) =>
      entry.location === "stash" ? entry.itemTypeId : entry.itemId,
    )).toEqual([ITEM_ID, SECOND_ITEM_ID]);
    expect(rebasedProjection.depotCount).toBe(4);
    expect(rebasedProjection.entries.map((entry) =>
      entry.location === "stash" ? entry.itemTypeId : entry.itemId,
    )).toEqual([ITEM_ID, SECOND_ITEM_ID]);
  });

  it("hides a withdrawal and adjusts the matching storage count", () => {
    const next = applyDepotPrediction(
      makeState({ entries: [DEPOT_ITEM] }),
      { kind: "withdraw", item: DEPOT_ITEM },
    );

    expect(next.depotCount).toBe(1);
    expect(next.entries).toEqual([]);
  });

  it("adds a partial deposit to an existing stash entry", () => {
    const next = applyDepotPrediction(
      makeState({ location: "stash", entries: [STASH_ITEM] }),
      { kind: "stash-deposit", item: INVENTORY_ITEM, count: 15 },
    );

    expect(next.stashCount).toBe(1);
    expect(next.entries[0]).toMatchObject({
      location: "stash",
      count: 65,
    });
  });

  it("reduces or removes a withdrawn stash entry immediately", () => {
    const partial = applyDepotPrediction(
      makeState({ location: "stash", entries: [STASH_ITEM] }),
      { kind: "stash-withdraw", item: STASH_ITEM, count: 20 },
    );
    const complete = applyDepotPrediction(partial, {
      kind: "stash-withdraw",
      item: { ...STASH_ITEM, count: 30 },
      count: 30,
    });

    expect(partial.entries[0]).toMatchObject({ count: 30 });
    expect(complete.entries).toEqual([]);
    expect(complete.stashCount).toBe(0);
  });
});
