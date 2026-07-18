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

const cacheOf = (items: Item[]): DepotCache => ({
  items,
  stash: new Map(),
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

    const sources = pickEscrowSources(cache, 675, 150);

    expect(sources).toEqual([
      { itemId: "a", itemRevision: 1, take: 100 },
      { itemId: "b", itemRevision: 1, take: 50 },
    ]);
  });

  it("returns null when depot stock cannot cover the amount", () => {
    const cache = cacheOf([depotItem("a", 675, 40, 0)]);

    expect(pickEscrowSources(cache, 675, 41)).toBeNull();
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

    const sources = pickEscrowSources(cache, 675, 10);
    expect(sources).toEqual([
      { itemId: "elsewhere", itemRevision: 1, take: 10 },
    ]);
    const counts = sellableDepotCounts(cache);
    expect(counts.get(675)).toBe(50);
  });

  it("never selects an item twice even when takes are small", () => {
    const cache = cacheOf([depotItem("a", 675, 100, 0)]);

    const sources = pickEscrowSources(cache, 675, 100);

    expect(sources).toHaveLength(1);
    const ids = new Set(sources?.map((source) => source.itemId));
    expect(ids.size).toBe(sources?.length);
  });
});
