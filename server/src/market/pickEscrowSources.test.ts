import { describe, expect, it } from "vitest";
import type { DepotCache } from "../depot/DepotCache";
import type { Item } from "../item/Item";
import { pickEscrowSources } from "./pickEscrowSources";
import { sellableDepotCounts } from "./sellableDepotCounts";

const depotItem = (
  id: string,
  typeId: number,
  count: number,
  slot: number,
  attributes: Record<string, unknown> = {},
): Item => ({
  id,
  typeId,
  count,
  attributes,
  version: 1,
  location: { kind: "depot", characterId: "char-1", depotId: 1, slot },
});

const cacheOf = (
  items: Item[],
  stash: ReadonlyMap<number, number> = new Map(),
): DepotCache => ({
  items,
  stash: new Map(stash),
  depotRevisions: new Map(),
  inboxRevision: 1,
  stashRevision: 1,
});

describe("pickEscrowSources", () => {
  it("covers the amount across rows and splits only the last", () => {
    const cache = cacheOf([
      depotItem("a", 675, 100, 0),
      depotItem("b", 675, 100, 1),
    ]);

    const plan = pickEscrowSources(cache, 675, 150);

    expect(plan).toEqual({
      sources: [
        { itemId: "a", itemRevision: 1, take: 100 },
        { itemId: "b", itemRevision: 1, take: 50 },
      ],
      stashTake: 0,
    });
  });

  it("returns null when depot and stash stock cannot cover the amount", () => {
    const cache = cacheOf([depotItem("a", 675, 40, 0)]);

    expect(pickEscrowSources(cache, 675, 41)).toBeNull();
  });

  it("draws the shortfall from the stash", () => {
    const cache = cacheOf(
      [depotItem("a", 675, 40, 0)],
      new Map([[675, 60]]),
    );

    expect(pickEscrowSources(cache, 675, 90)).toEqual({
      sources: [{ itemId: "a", itemRevision: 1, take: 40 }],
      stashTake: 50,
    });
  });

  it("sells purely from the stash when no depot row qualifies", () => {
    const cache = cacheOf([], new Map([[675, 60]]));

    expect(pickEscrowSources(cache, 675, 25)).toEqual({
      sources: [],
      stashTake: 25,
    });
  });

  it("counts stash stock as sellable", () => {
    const cache = cacheOf(
      [depotItem("a", 675, 40, 0)],
      new Map([[675, 60]]),
    );

    expect(sellableDepotCounts(cache).get(675)).toBe(100);
  });

  it("skips worn items and container contents but sells from any depot", () => {
    const container: Item = {
      id: "box",
      typeId: 2853,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "depot", characterId: "char-1", depotId: 1, slot: 3 },
    };
    const child: Item = {
      id: "child",
      typeId: 675,
      count: 5,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: "box", slot: 0 },
    };
    const cache = cacheOf([
      depotItem("worn", 675, 50, 0, { charges: 3 }),
      { ...depotItem("elsewhere", 675, 50, 0), location: { kind: "depot", characterId: "char-1", depotId: 2, slot: 0 } },
      container,
      child,
    ]);

    const plan = pickEscrowSources(cache, 675, 10);
    expect(plan?.sources).toEqual([
      { itemId: "elsewhere", itemRevision: 1, take: 10 },
    ]);
    const counts = sellableDepotCounts(cache);
    expect(counts.get(675)).toBe(50);
  });

  it("never selects an item twice even when takes are small", () => {
    const cache = cacheOf([depotItem("a", 675, 100, 0)]);

    const plan = pickEscrowSources(cache, 675, 100);

    expect(plan?.sources).toHaveLength(1);
    const ids = new Set(plan?.sources.map((source) => source.itemId));
    expect(ids.size).toBe(plan?.sources.length);
  });
});
