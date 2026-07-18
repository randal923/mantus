import { describe, expect, it } from "vitest";
import type { Item } from "../item/Item";
import { DepotCacheManager } from "./DepotCacheManager";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const inboxItem = (id: string, slot: number): Item => ({
  id,
  typeId: 100,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "inbox", characterId: CHARACTER_ID, slot },
});

const emptyLoad = () => ({
  characterId: CHARACTER_ID,
  items: [] as Item[],
  stash: new Map<number, number>(),
  depotRevisions: new Map<number, number>(),
  inboxRevision: 1,
  stashRevision: 1,
});

describe("DepotCacheManager", () => {
  it("applies external deliveries to an attached cache", () => {
    const manager = new DepotCacheManager();
    manager.attach(emptyLoad());

    manager.applyExternal(CHARACTER_ID, {
      upserts: [inboxItem("11111111-1111-4111-8111-111111111111", 0)],
      bumps: [{ kind: "inbox" }],
    });

    const cache = manager.get(CHARACTER_ID);
    expect(cache?.items).toHaveLength(1);
    expect(cache?.inboxRevision).toBe(2);
  });

  it("ignores external deliveries for offline characters", () => {
    const manager = new DepotCacheManager();

    manager.applyExternal(CHARACTER_ID, {
      upserts: [inboxItem("11111111-1111-4111-8111-111111111111", 0)],
      bumps: [{ kind: "inbox" }],
    });

    expect(manager.get(CHARACTER_ID)).toBeUndefined();
  });

  it("buffers deliveries during the login window and replays them on attach", () => {
    const manager = new DepotCacheManager();
    manager.beginLoad(CHARACTER_ID, 0);

    manager.applyExternal(CHARACTER_ID, {
      upserts: [inboxItem("11111111-1111-4111-8111-111111111111", 0)],
      bumps: [{ kind: "inbox" }],
    });
    manager.attach(emptyLoad());

    const cache = manager.get(CHARACTER_ID);
    expect(cache?.items.map((item) => item.id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("replays a delivery the load already saw without duplicating the item", () => {
    const manager = new DepotCacheManager();
    manager.beginLoad(CHARACTER_ID, 0);
    const delivered = inboxItem("11111111-1111-4111-8111-111111111111", 0);

    manager.applyExternal(CHARACTER_ID, {
      upserts: [delivered],
      bumps: [{ kind: "inbox" }],
    });
    manager.attach({ ...emptyLoad(), items: [delivered] });

    expect(manager.get(CHARACTER_ID)?.items).toHaveLength(1);
  });

  it("drops expired load buffers", () => {
    const manager = new DepotCacheManager();
    manager.beginLoad(CHARACTER_ID, 0);
    manager.applyExternal(CHARACTER_ID, {
      upserts: [inboxItem("11111111-1111-4111-8111-111111111111", 0)],
    });

    manager.expireLoadBuffers(120_000);
    manager.attach(emptyLoad());

    expect(manager.get(CHARACTER_ID)?.items).toHaveLength(0);
  });

  it("removes returned subtrees and bumps the inbox revision", () => {
    const manager = new DepotCacheManager();
    const delivered = inboxItem("11111111-1111-4111-8111-111111111111", 0);
    manager.attach({ ...emptyLoad(), items: [delivered] });

    manager.applyExternal(CHARACTER_ID, {
      removedItemIds: [delivered.id],
      bumps: [{ kind: "inbox" }],
    });

    const cache = manager.get(CHARACTER_ID);
    expect(cache?.items).toHaveLength(0);
    expect(cache?.inboxRevision).toBe(2);
  });
});
