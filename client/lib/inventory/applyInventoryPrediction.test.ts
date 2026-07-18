import { describe, expect, it } from "vitest";
import type {
  InventoryItem,
  InventoryItemPresentation,
  InventoryState,
} from "@tibia/protocol";
import { applyInventoryPrediction } from "./applyInventoryPrediction";

const BACKPACK_ID = "00000000-0000-4000-8000-000000000001";
const STACK_ID = "00000000-0000-4000-8000-000000000002";
const POUCH_ID = "00000000-0000-4000-8000-000000000003";
const CHILD_ID = "00000000-0000-4000-8000-000000000004";
const NEW_ID = "00000000-0000-4000-8000-000000000005";
const SECOND_NEW_ID = "00000000-0000-4000-8000-000000000006";

const STACK_PRESENTATION: InventoryItemPresentation = {
  typeId: 100,
  clientId: 100,
  spriteId: 100,
  name: "stack",
  stackable: true,
  maxCount: 100,
  stowable: true,
  tooltip: {
    name: "stack",
    typeLine: "Item",
    spriteId: 100,
    affixes: [],
    weight: 10,
  },
};

const makeItem = (
  id: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem => ({
  ...STACK_PRESENTATION,
  id,
  count: 1,
  revision: 1,
  ...overrides,
});

const BACKPACK = makeItem(BACKPACK_ID, {
  typeId: 200,
  clientId: 200,
  spriteId: 200,
  name: "backpack",
  stackable: false,
  maxCount: 1,
  equipmentSlot: "backpack",
  containerCapacity: 4,
});

const makeState = (
  overrides: Partial<InventoryState> = {},
): InventoryState => ({
  revision: 1,
  equipment: { backpack: BACKPACK },
  items: [{ slot: 0, item: makeItem(STACK_ID, { count: 80 }) }],
  gold: 0,
  platinum: 0,
  crystal: 0,
  capacityUsed: 1,
  capacityMax: 100,
  slotCount: 4,
  containers: [],
  ...overrides,
});

describe("applyInventoryPrediction", () => {
  it("reduces a deposited stack immediately and marks it provisional", () => {
    const next = applyInventoryPrediction(makeState(), {
      kind: "remove",
      itemId: STACK_ID,
      count: 25,
    });

    expect(next?.items[0]?.item).toMatchObject({
      id: STACK_ID,
      count: 55,
      optimistic: true,
    });
  });

  it("keeps later queued removals after the first server snapshot", () => {
    const secondItem = makeItem(SECOND_NEW_ID, {
      typeId: 101,
      clientId: 101,
      spriteId: 101,
      name: "second stack",
      count: 20,
    });
    const initial = makeState({
      items: [
        { slot: 0, item: makeItem(STACK_ID, { count: 80 }) },
        { slot: 1, item: secondItem },
      ],
    });
    const firstProjection = applyInventoryPrediction(initial, {
      kind: "remove",
      itemId: STACK_ID,
      count: 80,
    });
    const queuedProjection = firstProjection
      ? applyInventoryPrediction(firstProjection, {
          kind: "remove",
          itemId: SECOND_NEW_ID,
          count: 20,
        })
      : null;
    const confirmedFirst = makeState({
      revision: 2,
      items: [{ slot: 1, item: secondItem }],
    });
    const rebasedProjection = applyInventoryPrediction(confirmedFirst, {
      kind: "remove",
      itemId: SECOND_NEW_ID,
      count: 20,
    });

    expect(queuedProjection?.items).toEqual([]);
    expect(rebasedProjection?.items).toEqual([]);
  });

  it("removes a deposited container and its open descendant sections", () => {
    const pouch = makeItem(POUCH_ID, {
      typeId: 300,
      stackable: false,
      maxCount: 1,
      containerCapacity: 4,
    });
    const child = makeItem(CHILD_ID, {
      typeId: 301,
      stackable: false,
      maxCount: 1,
      containerCapacity: 4,
    });
    const next = applyInventoryPrediction(
      makeState({
        items: [{ slot: 1, item: pouch }],
        containers: [
          {
            container: pouch,
            parentContainerId: BACKPACK_ID,
            capacity: 4,
            items: [{ slot: 0, item: child }],
          },
          {
            container: child,
            parentContainerId: POUCH_ID,
            capacity: 4,
            items: [],
          },
        ],
      }),
      { kind: "remove", itemId: POUCH_ID, count: 1 },
    );

    expect(next?.items).toEqual([]);
    expect(next?.containers).toEqual([]);
  });

  it("fills existing shop stacks before showing a new provisional stack", () => {
    const next = applyInventoryPrediction(makeState(), {
      kind: "add",
      item: STACK_PRESENTATION,
      count: 30,
      itemIds: [NEW_ID],
    });

    expect(next?.items).toHaveLength(2);
    expect(next?.items[0]?.item).toMatchObject({
      id: STACK_ID,
      count: 100,
      optimistic: true,
    });
    expect(next?.items[1]).toMatchObject({
      slot: 1,
      item: { id: NEW_ID, count: 10, optimistic: true },
    });
  });

  it("merges a depot withdrawal into a matching carried stack", () => {
    const next = applyInventoryPrediction(makeState(), {
      kind: "add",
      item: STACK_PRESENTATION,
      count: 20,
      itemIds: [NEW_ID],
    });

    expect(next?.items).toHaveLength(1);
    expect(next?.items[0]?.item).toMatchObject({
      id: STACK_ID,
      count: 100,
      optimistic: true,
    });
  });

  it("creates one provisional slot per non-stackable item", () => {
    const next = applyInventoryPrediction(makeState({ items: [] }), {
      kind: "add",
      item: { ...STACK_PRESENTATION, stackable: false, maxCount: 1 },
      count: 2,
      itemIds: [NEW_ID, SECOND_NEW_ID],
    });

    expect(next?.items).toMatchObject([
      { slot: 0, item: { id: NEW_ID, count: 1, optimistic: true } },
      { slot: 1, item: { id: SECOND_NEW_ID, count: 1, optimistic: true } },
    ]);
  });

  it("does not invent space when the backpack is full", () => {
    const items = Array.from({ length: 4 }, (_, slot) => ({
      slot,
      item: makeItem(`full-${slot}`, {
        typeId: 200 + slot,
        count: 100,
      }),
    }));

    expect(
      applyInventoryPrediction(makeState({ items }), {
        kind: "add",
        item: STACK_PRESENTATION,
        count: 1,
        itemIds: [NEW_ID],
      }),
    ).toBeNull();
  });
});
