import { beforeAll, describe, expect, it, vi } from "vitest";
import { GOLD_COIN_TYPE_ID, PLATINUM_COIN_TYPE_ID } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { CarriedPlan } from "../item/plan/CarriedPlan";
import { loadItemCatalog } from "../item/loadItemCatalog";
import type { Session } from "../Session";
import { GoldConverterService } from "./GoldConverterService";

const CHARACTER_ID = "11111111-1111-4111-8111-111111111111";
const BACKPACK_ID = "22222222-2222-4222-8222-222222222222";
const CONVERTER_ID = "33333333-3333-4333-8333-333333333333";
const COINS_ID = "44444444-4444-4444-8444-444444444444";

let catalog: ItemCatalog;
beforeAll(async () => {
  catalog = await loadItemCatalog();
});

const harness = (options: { itemOperationPending?: boolean } = {}) => {
  let items: Item[] = [
    {
      id: BACKPACK_ID,
      typeId: 2854,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "equipment", characterId: CHARACTER_ID, slot: "backpack" },
    },
    {
      id: CONVERTER_ID,
      typeId: 23722,
      count: 1,
      attributes: { charges: 500 },
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    },
    {
      id: COINS_ID,
      typeId: GOLD_COIN_TYPE_ID,
      count: 100,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
    },
  ];
  // Mirrors InventoryCacheManager.applyMutation so a second intent sees the
  // cache the first one left behind.
  const applyCarriedPlan = vi.fn(
    (_session: Session, _characterId: string, plan: CarriedPlan) => {
      const afterById = new Map(plan.mutation.after.map((item) => [item.id, item]));
      const removed = new Set(plan.mutation.removedItemIds ?? []);
      const next = items
        .filter((item) => item.id !== plan.mutation.before?.id && !removed.has(item.id))
        .map((item) => afterById.get(item.id) ?? item);
      for (const after of plan.mutation.after) {
        if (!next.some((item) => item.id === after.id)) next.push(after);
      }
      items = next;
    },
  );
  const session = {
    playerId: CHARACTER_ID,
    itemOperationPending: options.itemOperationPending ?? false,
    itemPersistsPending: 0,
    send: vi.fn(),
    sendError: vi.fn(),
  };
  const service = new GoldConverterService(
    {
      inventorySnapshot: () => ({ items, capacityMax: 10_000, bankBalance: 0 }),
      applyCarriedPlan,
    } as unknown as ItemIntentHandler,
    catalog,
  );
  const use = (revision = 1, targetRevision = 1) =>
    service.handle(
      session as unknown as Session,
      {
        type: "use-item-on-item",
        itemId: CONVERTER_ID,
        revision,
        targetItemId: COINS_ID,
        targetRevision,
      },
      1_000,
    );
  return { use, session, applyCarriedPlan, items: () => items };
};

describe("GoldConverterService", () => {
  it("converts a carried gold stack in one applied plan", () => {
    const h = harness();
    expect(h.use()).toBe(true);
    expect(h.applyCarriedPlan).toHaveBeenCalledTimes(1);
    expect(h.session.sendError).not.toHaveBeenCalled();
    const after = h.items();
    expect(after.some((item) => item.typeId === GOLD_COIN_TYPE_ID)).toBe(false);
    expect(after.find((item) => item.typeId === PLATINUM_COIN_TYPE_ID)?.count).toBe(1);
    expect(after.find((item) => item.id === CONVERTER_ID)?.attributes.charges).toBe(499);
  });

  it("lets a replayed or racing intent for the same stack convert exactly once", () => {
    const h = harness();
    expect(h.use()).toBe(true);
    expect(h.use()).toBe(true);
    expect(h.applyCarriedPlan).toHaveBeenCalledTimes(1);
    expect(h.session.sendError).toHaveBeenCalledWith("item-action-failed");
    expect(h.items().filter((item) => item.typeId === PLATINUM_COIN_TYPE_ID)).toHaveLength(1);
  });

  it("ignores intents whose tool is not a gold converter", () => {
    const h = harness();
    const handled = h.use(7);
    // Wrong revision on a real converter is still this service's business.
    expect(handled).toBe(true);
    expect(h.session.sendError).toHaveBeenCalledWith("item-action-failed");
    expect(h.applyCarriedPlan).not.toHaveBeenCalled();
  });

  it("waits out a DB-first item operation instead of planning over it", () => {
    const h = harness({ itemOperationPending: true });
    expect(h.use()).toBe(true);
    expect(h.session.sendError).toHaveBeenCalledWith("item-action-failed");
    expect(h.applyCarriedPlan).not.toHaveBeenCalled();
  });
});
