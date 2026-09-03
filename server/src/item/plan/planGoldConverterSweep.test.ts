import { beforeAll, describe, expect, it } from "vitest";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "@tibia/protocol";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import { loadItemCatalog } from "../loadItemCatalog";
import { planGoldConverterSweep } from "./planGoldConverterSweep";

const CHARACTER_ID = "11111111-1111-4111-8111-111111111111";
const BACKPACK_ID = "22222222-2222-4222-8222-222222222222";
const POUCH_ID = "77777777-7777-4777-8777-777777777777";
const CONVERTER_ID = "33333333-3333-4333-8333-333333333333";
const BACKPACK = 2854;
const GOLD_CONVERTER = 23722;
const APPLE = 3585;

let catalog: ItemCatalog;
beforeAll(async () => {
  catalog = await loadItemCatalog();
});

const backpack = (): Item => ({
  id: BACKPACK_ID,
  typeId: BACKPACK,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "equipment", characterId: CHARACTER_ID, slot: "backpack" },
});
let nextId = 0;
const stack = (
  typeId: number,
  count: number,
  slot: number,
  containerId = BACKPACK_ID,
): Item => ({
  id: `44444444-4444-4444-8444-${String(nextId++).padStart(12, "0")}`,
  typeId,
  count,
  attributes: {},
  version: 3,
  location: { kind: "container", containerId, slot },
});
const converter = (attributes: Readonly<Record<string, unknown>> = {}): Item => ({
  id: CONVERTER_ID,
  typeId: GOLD_CONVERTER,
  count: 1,
  attributes,
  version: 3,
  location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
});
const sweep = (items: ReadonlyArray<Item>, converterVersion = 3) =>
  planGoldConverterSweep({
    characterId: CHARACTER_ID,
    catalog,
    items,
    converterId: CONVERTER_ID,
    converterVersion,
  });
const totals = (items: ReadonlyArray<Item>, result: NonNullable<ReturnType<typeof sweep>>) => {
  const afterById = new Map(result.plan.mutation.after.map((item) => [item.id, item]));
  const removed = new Set(result.plan.mutation.removedItemIds);
  const live = items
    .filter((item) => !removed.has(item.id) && item.id !== CONVERTER_ID)
    .map((item) => afterById.get(item.id) ?? item)
    .concat(result.plan.mutation.after.filter((item) => !items.some((i) => i.id === item.id)));
  const sum = (typeId: number) =>
    live.filter((item) => item.typeId === typeId).reduce((n, item) => n + item.count, 0);
  return {
    gold: sum(GOLD_COIN_TYPE_ID),
    platinum: sum(PLATINUM_COIN_TYPE_ID),
    crystal: sum(CRYSTAL_COIN_TYPE_ID),
    live,
  };
};

describe("planGoldConverterSweep", () => {
  it("converts by total across stacks, consolidating the remainder", () => {
    const items = [
      backpack(),
      converter(),
      stack(GOLD_COIN_TYPE_ID, 100, 1),
      stack(GOLD_COIN_TYPE_ID, 100, 2),
      stack(GOLD_COIN_TYPE_ID, 50, 3),
    ];
    const result = sweep(items)!;
    expect(result).toMatchObject({
      goldSpent: 200,
      platinumMinted: 2,
      platinumSpent: 0,
      crystalMinted: 0,
      chargesSpent: 2,
      converterDestroyed: false,
    });
    const t = totals(items, result);
    expect([t.gold, t.platinum, t.crystal]).toEqual([50, 2, 0]);
    // The last stacks empty first; the first keeps the remainder.
    expect(result.plan.mutation.removedItemIds).toEqual([items[4]!.id, items[3]!.id]);
    expect(result.plan.mutation.after.find((item) => item.id === items[2]!.id)?.count).toBe(50);
    const platinum = result.plan.mutation.after.find((item) => item.typeId === PLATINUM_COIN_TYPE_ID)!;
    expect(platinum.location).toEqual({ kind: "container", containerId: BACKPACK_ID, slot: 2 });
    const converterAfter = result.plan.mutation.after.find((item) => item.id === CONVERTER_ID)!;
    expect(converterAfter.attributes.charges).toBe(498);
    expect(result.plan.persist.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "destruction", typeId: GOLD_COIN_TYPE_ID, count: 100 }),
        expect.objectContaining({ kind: "destruction", typeId: GOLD_COIN_TYPE_ID, count: 50 }),
        expect.objectContaining({ kind: "destruction", itemId: items[2]!.id, count: 50 }),
        expect.objectContaining({ kind: "creation", typeId: PLATINUM_COIN_TYPE_ID, count: 2, reason: "gold-converter" }),
      ]),
    );
    expect(result.plan.persist.rowOps.map((op) => op.kind)).toEqual([
      "delete", "delete", "write", "write", "insert",
    ]);
  });

  it("chains gold into platinum into crystal in one use", () => {
    const items = [
      backpack(),
      converter(),
      ...Array.from({ length: 100 }, (_, i) => stack(GOLD_COIN_TYPE_ID, 100, i + 1)),
    ];
    const result = sweep(items)!;
    expect(result).toMatchObject({
      goldSpent: 10_000,
      platinumMinted: 100,
      platinumSpent: 100,
      crystalMinted: 1,
      chargesSpent: 101,
    });
    const t = totals(items, result);
    expect([t.gold, t.platinum, t.crystal]).toEqual([0, 0, 1]);
    expect(t.live.filter((item) => item.typeId !== BACKPACK)).toHaveLength(1);
  });

  it("tops up existing platinum before opening a stack, and nets minted against spent", () => {
    const items = [
      backpack(),
      converter(),
      stack(PLATINUM_COIN_TYPE_ID, 60, 1),
      stack(PLATINUM_COIN_TYPE_ID, 60, 2),
      stack(GOLD_COIN_TYPE_ID, 100, 3),
      stack(CRYSTAL_COIN_TYPE_ID, 5, 4),
    ];
    const result = sweep(items)!;
    expect(result).toMatchObject({ platinumMinted: 1, crystalMinted: 1, chargesSpent: 2 });
    const t = totals(items, result);
    expect([t.gold, t.platinum, t.crystal]).toEqual([0, 21, 6]);
    expect(result.plan.mutation.after.find((item) => item.id === items[5]!.id)?.count).toBe(6);
    expect(result.plan.mutation.removedItemIds).toEqual([items[4]!.id, items[3]!.id]);
  });

  it("counts coins in the Loot Pouch and lands new stacks in the slot they vacated when the backpack is full", () => {
    const capacity = catalog.require(BACKPACK).containerCapacity!;
    const pouch: Item = {
      id: POUCH_ID,
      typeId: 23721,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "equipment", characterId: CHARACTER_ID, slot: "bound" },
    };
    const filler = Array.from({ length: capacity - 1 }, (_, i) => stack(APPLE, 1, i + 1));
    const items = [
      backpack(),
      converter(),
      ...filler,
      pouch,
      stack(GOLD_COIN_TYPE_ID, 100, 0, POUCH_ID),
      stack(GOLD_COIN_TYPE_ID, 100, 1, POUCH_ID),
    ];
    const result = sweep(items)!;
    const t = totals(items, result);
    expect([t.gold, t.platinum]).toEqual([0, 2]);
    const platinum = result.plan.mutation.after.find((item) => item.typeId === PLATINUM_COIN_TYPE_ID)!;
    expect(platinum.location).toEqual({ kind: "container", containerId: POUCH_ID, slot: 1 });
  });

  it("spends only the charges it has and destroys the converter with its last one", () => {
    const items = [
      backpack(),
      converter({ charges: 1 }),
      stack(GOLD_COIN_TYPE_ID, 100, 1),
      stack(GOLD_COIN_TYPE_ID, 100, 2),
    ];
    const result = sweep(items)!;
    expect(result).toMatchObject({ platinumMinted: 1, chargesSpent: 1, converterDestroyed: true });
    const t = totals(items, result);
    expect([t.gold, t.platinum]).toEqual([100, 1]);
    expect(result.plan.mutation.removedItemIds).toContain(CONVERTER_ID);
    expect(result.plan.persist.rowOps).toContainEqual({ kind: "delete", itemId: CONVERTER_ID, expectedVersion: 3 });
    expect(result.plan.persist.audits).toContainEqual({
      kind: "destruction", itemId: CONVERTER_ID, typeId: GOLD_CONVERTER, count: 1, reason: "gold-converter",
    });
  });

  it("plans nothing below 100 coins, without charges, or at a stale revision", () => {
    expect(sweep([backpack(), converter(), stack(GOLD_COIN_TYPE_ID, 99, 1), stack(PLATINUM_COIN_TYPE_ID, 99, 2)])).toBeNull();
    expect(sweep([backpack(), converter({ charges: 0 }), stack(GOLD_COIN_TYPE_ID, 100, 1)])).toBeNull();
    expect(sweep([backpack(), converter(), stack(GOLD_COIN_TYPE_ID, 100, 1)], 2)).toBeNull();
    expect(sweep([backpack(), { ...converter(), typeId: APPLE }, stack(GOLD_COIN_TYPE_ID, 100, 1)])).toBeNull();
  });

  it("converts 99 gold plus 1 more gold stack the same as one 100 stack (totals, not stacks)", () => {
    const items = [backpack(), converter(), stack(GOLD_COIN_TYPE_ID, 99, 1), stack(GOLD_COIN_TYPE_ID, 1, 2)];
    const result = sweep(items)!;
    const t = totals(items, result);
    expect([t.gold, t.platinum]).toEqual([0, 1]);
  });
});
