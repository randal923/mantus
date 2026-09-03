import { beforeAll, describe, expect, it } from "vitest";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "@tibia/protocol";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import { loadItemCatalog } from "../loadItemCatalog";
import { planGoldConversion } from "./planGoldConversion";

const CHARACTER_ID = "11111111-1111-4111-8111-111111111111";
const BACKPACK_ID = "22222222-2222-4222-8222-222222222222";
const CONVERTER_ID = "33333333-3333-4333-8333-333333333333";
const COINS_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ID = "55555555-5555-4555-8555-555555555555";
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
const inSlot = (
  id: string,
  typeId: number,
  count: number,
  slot: number,
  attributes: Readonly<Record<string, unknown>> = {},
): Item => ({
  id,
  typeId,
  count,
  attributes,
  version: 3,
  location: { kind: "container", containerId: BACKPACK_ID, slot },
});
const converter = (attributes: Readonly<Record<string, unknown>> = {}) =>
  inSlot(CONVERTER_ID, GOLD_CONVERTER, 1, 0, attributes);

const plan = (
  items: ReadonlyArray<Item>,
  overrides: Partial<Parameters<typeof planGoldConversion>[0]> = {},
) =>
  planGoldConversion({
    characterId: CHARACTER_ID,
    catalog,
    items,
    capacityMax: 10_000,
    converterId: CONVERTER_ID,
    converterVersion: 3,
    targetId: COINS_ID,
    targetVersion: 3,
    ...overrides,
  });

describe("planGoldConversion", () => {
  it("turns a full gold stack into one platinum coin and burns a charge", () => {
    const coins = inSlot(COINS_ID, GOLD_COIN_TYPE_ID, 100, 1);
    const result = plan([backpack(), converter(), coins]);
    expect(result).not.toBeNull();
    const created = result!.mutation.after.find(
      (item) => item.typeId === PLATINUM_COIN_TYPE_ID,
    )!;
    expect(created.count).toBe(1);
    expect(created.location).toEqual({
      kind: "container",
      containerId: BACKPACK_ID,
      slot: 1,
    });
    expect(result!.mutation.removedItemIds).toEqual([COINS_ID]);
    const converterAfter = result!.mutation.after.find(
      (item) => item.id === CONVERTER_ID,
    )!;
    // A GM-minted converter carries no explicit charges: the catalog's 500.
    expect(converterAfter.attributes.charges).toBe(499);
    expect(converterAfter.version).toBe(4);
    expect(result!.persist.rowOps).toEqual([
      { kind: "delete", itemId: COINS_ID, expectedVersion: 3 },
      { kind: "write", expectedVersion: 3, item: converterAfter },
      { kind: "insert", item: created },
    ]);
    expect(result!.persist.audits).toEqual([
      {
        kind: "destruction",
        itemId: COINS_ID,
        typeId: GOLD_COIN_TYPE_ID,
        count: 100,
        reason: "gold-converter",
      },
      {
        kind: "creation",
        itemId: created.id,
        typeId: PLATINUM_COIN_TYPE_ID,
        count: 1,
        reason: "gold-converter",
      },
    ]);
  });

  it("tops up a partial platinum stack instead of opening a new one", () => {
    const coins = inSlot(COINS_ID, GOLD_COIN_TYPE_ID, 100, 1);
    const platinum = inSlot(OTHER_ID, PLATINUM_COIN_TYPE_ID, 7, 2);
    const result = plan([backpack(), converter(), coins, platinum]);
    const merged = result!.mutation.after.find((item) => item.id === OTHER_ID)!;
    expect(merged.count).toBe(8);
    expect(merged.version).toBe(4);
    expect(result!.persist.rowOps[2]).toEqual({
      kind: "write",
      expectedVersion: 3,
      item: merged,
    });
    expect(result!.persist.audits[1]).toMatchObject({
      kind: "creation",
      itemId: OTHER_ID,
      count: 1,
    });
  });

  it("refuses a short gold stack — gold only ever steps up", () => {
    expect(plan([backpack(), converter(), inSlot(COINS_ID, GOLD_COIN_TYPE_ID, 99, 1)])).toBeNull();
  });

  it("turns a full platinum stack into one crystal coin", () => {
    const result = plan([backpack(), converter(), inSlot(COINS_ID, PLATINUM_COIN_TYPE_ID, 100, 1)]);
    expect(result!.mutation.after.map((item) => [item.typeId, item.count])).toEqual([
      [GOLD_CONVERTER, 1],
      [CRYSTAL_COIN_TYPE_ID, 1],
    ]);
    expect(result!.mutation.removedItemIds).toEqual([COINS_ID]);
  });

  it("breaks one coin off a partial platinum stack into a hundred gold", () => {
    const result = plan([backpack(), converter(), inSlot(COINS_ID, PLATINUM_COIN_TYPE_ID, 30, 1)]);
    const stack = result!.mutation.after.find((item) => item.id === COINS_ID)!;
    expect(stack.count).toBe(29);
    const gold = result!.mutation.after.find((item) => item.typeId === GOLD_COIN_TYPE_ID)!;
    expect(gold.count).toBe(100);
    expect(gold.location).toEqual({ kind: "container", containerId: BACKPACK_ID, slot: 2 });
    expect(result!.mutation.removedItemIds).toEqual([]);
    expect(result!.persist.audits[0]).toMatchObject({ kind: "destruction", count: 1 });
  });

  it("breaks a lone crystal coin into a hundred platinum, removing the stack", () => {
    const result = plan([backpack(), converter(), inSlot(COINS_ID, CRYSTAL_COIN_TYPE_ID, 1, 1)]);
    expect(result!.mutation.removedItemIds).toEqual([COINS_ID]);
    const platinum = result!.mutation.after.find((item) => item.typeId === PLATINUM_COIN_TYPE_ID)!;
    expect(platinum.count).toBe(100);
  });

  it("destroys the converter with its last charge", () => {
    const result = plan([backpack(), converter({ charges: 1 }), inSlot(COINS_ID, GOLD_COIN_TYPE_ID, 100, 1)]);
    expect(result!.mutation.removedItemIds).toEqual([COINS_ID, CONVERTER_ID]);
    expect(result!.mutation.after.some((item) => item.id === CONVERTER_ID)).toBe(false);
    expect(result!.persist.rowOps[1]).toEqual({ kind: "delete", itemId: CONVERTER_ID, expectedVersion: 3 });
    expect(result!.persist.audits[2]).toEqual({
      kind: "destruction",
      itemId: CONVERTER_ID,
      typeId: GOLD_CONVERTER,
      count: 1,
      reason: "gold-converter",
    });
  });

  it("refuses an empty converter", () => {
    expect(plan([backpack(), converter({ charges: 0 }), inSlot(COINS_ID, GOLD_COIN_TYPE_ID, 100, 1)])).toBeNull();
  });

  it("refuses stale revisions on either item (replay / race)", () => {
    const items = [backpack(), converter(), inSlot(COINS_ID, GOLD_COIN_TYPE_ID, 100, 1)];
    expect(plan(items, { converterVersion: 2 })).toBeNull();
    expect(plan(items, { targetVersion: 4 })).toBeNull();
  });

  it("refuses non-coin targets, the converter itself, and non-converter tools", () => {
    expect(plan([backpack(), converter(), inSlot(COINS_ID, APPLE, 1, 1)])).toBeNull();
    expect(plan([backpack(), converter()], { targetId: CONVERTER_ID })).toBeNull();
    expect(
      plan([backpack(), inSlot(CONVERTER_ID, APPLE, 1, 0), inSlot(COINS_ID, GOLD_COIN_TYPE_ID, 100, 1)]),
    ).toBeNull();
  });

  it("refuses a break-down the character cannot carry", () => {
    // 100 gold weigh 100 oz; one platinum weighs 0.1 oz.
    expect(
      plan([backpack(), converter(), inSlot(COINS_ID, PLATINUM_COIN_TYPE_ID, 30, 1)], { capacityMax: 20 }),
    ).toBeNull();
  });

  it("refuses a break-down with no free slot, but still steps up into the vacated one", () => {
    const capacity = catalog.require(BACKPACK).containerCapacity!;
    const filler = Array.from({ length: capacity - 2 }, (_, index) =>
      inSlot(`66666666-6666-4666-8666-${String(index).padStart(12, "0")}`, APPLE, 1, index + 2),
    );
    expect(
      plan([backpack(), converter(), inSlot(COINS_ID, PLATINUM_COIN_TYPE_ID, 30, 1), ...filler]),
    ).toBeNull();
    const stepUp = plan([backpack(), converter(), inSlot(COINS_ID, GOLD_COIN_TYPE_ID, 100, 1), ...filler]);
    const platinum = stepUp!.mutation.after.find((item) => item.typeId === PLATINUM_COIN_TYPE_ID)!;
    expect(platinum.location).toEqual({ kind: "container", containerId: BACKPACK_ID, slot: 1 });
  });
});
