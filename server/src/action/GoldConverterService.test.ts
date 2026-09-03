import { beforeAll, describe, expect, it, vi } from "vitest";
import { GOLD_COIN_TYPE_ID, PLATINUM_COIN_TYPE_ID } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { CarriedPlan } from "../item/plan/CarriedPlan";
import { loadItemCatalog } from "../item/loadItemCatalog";
import type { Session } from "../Session";
import {
  GOLD_CONVERTER_NOTHING_MESSAGE,
  GoldConverterService,
} from "./GoldConverterService";

const CHARACTER_ID = "11111111-1111-4111-8111-111111111111";
const BACKPACK_ID = "22222222-2222-4222-8222-222222222222";
const CONVERTER_ID = "33333333-3333-4333-8333-333333333333";
const COINS_ID = "44444444-4444-4444-8444-444444444444";

let catalog: ItemCatalog;
beforeAll(async () => {
  catalog = await loadItemCatalog();
});

const harness = (options: { gold?: number; itemOperationPending?: boolean; charges?: number } = {}) => {
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
      attributes: { charges: options.charges ?? 500 },
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    },
    {
      id: COINS_ID,
      typeId: GOLD_COIN_TYPE_ID,
      count: options.gold ?? 100,
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
  const use = (itemId = CONVERTER_ID, revision = 1) =>
    service.handleUseItem(
      session as unknown as Session,
      { type: "use-item", itemId, revision },
      1_000,
    );
  return { use, session, applyCarriedPlan, items: () => items };
};

describe("GoldConverterService", () => {
  it("sweeps the carried coins in one applied plan and reports what it converted", () => {
    const h = harness({ gold: 100 });
    expect(h.use()).toBe(true);
    expect(h.applyCarriedPlan).toHaveBeenCalledTimes(1);
    expect(h.session.sendError).not.toHaveBeenCalled();
    expect(h.session.send).toHaveBeenCalledWith({
      type: "combat-log",
      kind: "condition",
      text: "Converted 100 gold coins into 1 platinum coin.",
    });
    const after = h.items();
    expect(after.some((item) => item.typeId === GOLD_COIN_TYPE_ID)).toBe(false);
    expect(after.find((item) => item.typeId === PLATINUM_COIN_TYPE_ID)?.count).toBe(1);
    expect(after.find((item) => item.id === CONVERTER_ID)?.attributes.charges).toBe(499);
  });

  it("refuses a replayed intent: the converter's revision moved with the first sweep", () => {
    const h = harness();
    expect(h.use()).toBe(true);
    expect(h.use()).toBe(true);
    expect(h.applyCarriedPlan).toHaveBeenCalledTimes(1);
    expect(h.session.sendError).toHaveBeenCalledWith("item-action-failed");
  });

  it("answers with a status line, not an error, when there is nothing to convert", () => {
    const h = harness({ gold: 99 });
    expect(h.use()).toBe(true);
    expect(h.applyCarriedPlan).not.toHaveBeenCalled();
    expect(h.session.sendError).not.toHaveBeenCalled();
    expect(h.session.send).toHaveBeenCalledWith({
      type: "combat-log",
      kind: "condition",
      text: GOLD_CONVERTER_NOTHING_MESSAGE,
    });
  });

  it("says when the last charge used the converter up", () => {
    const h = harness({ charges: 1 });
    h.use();
    expect(h.session.send).toHaveBeenCalledWith({
      type: "combat-log",
      kind: "condition",
      text: "Converted 100 gold coins into 1 platinum coin. The gold converter is used up.",
    });
    expect(h.items().some((item) => item.id === CONVERTER_ID)).toBe(false);
  });

  it("ignores uses of items that are not a gold converter", () => {
    const h = harness();
    expect(h.use(COINS_ID)).toBe(false);
    expect(h.applyCarriedPlan).not.toHaveBeenCalled();
  });

  it("waits out a DB-first item operation instead of planning over it", () => {
    const h = harness({ itemOperationPending: true });
    expect(h.use()).toBe(true);
    expect(h.session.sendError).toHaveBeenCalledWith("item-action-failed");
    expect(h.applyCarriedPlan).not.toHaveBeenCalled();
  });
});
