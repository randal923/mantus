import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOT_FILTER,
  type LootFilter,
  type ServerMessage,
} from "@tibia/protocol";
import { LootFilterHandler } from "./LootFilterHandler";
import type { CharacterStore } from "./character/CharacterStore";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";
import { InMemoryCharacterStore } from "./test/InMemoryCharacterStore";
import { makeCharacter } from "./test/makeCharacter";

const GOLD = 3031;
const AXE = 3274;
/** Deliberately absent from the stub catalog: an id no real item carries. */
const UNKNOWN = 60_001;

const CATALOG = new Map([
  [GOLD, { id: GOLD, name: "gold coin", spriteId: 100, pickupable: true }],
  [AXE, { id: AXE, name: "axe", spriteId: 200, pickupable: true }],
]);

function makeHandler(
  store: CharacterStore,
  carried: ReadonlyArray<{ typeId: number; count: number }> = [],
) {
  const registry = { contains: () => true } as unknown as SessionRegistry;
  const world = {
    getPlayer: (id: string) => (id === "char-1" ? { id } : undefined),
  } as unknown as World;
  const items = {
    itemType: (typeId: number) => CATALOG.get(typeId),
    inventorySnapshot: () => ({ items: carried, capacityMax: 400, bankBalance: 0 }),
  } as unknown as ItemIntentHandler;
  return new LootFilterHandler(registry, world, items, store);
}

function makeSession(playerId: string | null, filter?: LootFilter) {
  const sent: ServerMessage[] = [];
  const errors: string[] = [];
  const session = {
    playerId,
    lootFilterUpdatePending: false,
    lootFilterItemsReadyAt: 0,
    lootFilter: filter ?? { ...DEFAULT_LOOT_FILTER, ignoredItemTypeIds: [] },
    send: (message: ServerMessage) => sent.push(message),
    sendError: (code: string) => errors.push(code),
  } as unknown as Session;
  return { session, sent, errors };
}

function seededStore() {
  const store = new InMemoryCharacterStore();
  store.seed(makeCharacter("char-1"));
  return store;
}

async function settle(handler: LootFilterHandler) {
  await new Promise((resolve) => setImmediate(resolve));
  handler.applyResolvedOutcomes();
}

describe("LootFilterHandler", () => {
  it("rejects sessions without a joined character", () => {
    const { session, errors } = makeSession(null);
    makeHandler(seededStore()).handleUpdate(session, {
      type: "update-loot-filter",
      filter: DEFAULT_LOOT_FILTER,
    });
    expect(errors).toEqual(["join-required"]);
  });

  it("drops unknown and duplicate ids instead of rejecting the whole filter", async () => {
    const store = seededStore();
    const handler = makeHandler(store);
    const { session, sent, errors } = makeSession("char-1");

    handler.handleUpdate(session, {
      type: "update-loot-filter",
      filter: { enabled: true, ignoredItemTypeIds: [GOLD, UNKNOWN, GOLD, AXE] },
    });
    await settle(handler);

    expect(errors).toEqual([]);
    expect(session.lootFilter).toEqual({
      enabled: true,
      ignoredItemTypeIds: [GOLD, AXE],
    });
    expect(sent.at(-1)).toMatchObject({
      type: "loot-filter-updated",
      filter: { enabled: true, ignoredItemTypeIds: [GOLD, AXE] },
    });
    expect(store.get("char-1")?.lootFilter.ignoredItemTypeIds).toEqual([
      GOLD,
      AXE,
    ]);
  });

  it("applies the filter in memory before the write lands", () => {
    const handler = makeHandler(seededStore());
    const { session } = makeSession("char-1");

    handler.handleUpdate(session, {
      type: "update-loot-filter",
      filter: { enabled: true, ignoredItemTypeIds: [AXE] },
    });

    expect(session.lootFilter.enabled).toBe(true);
    expect(session.lootFilter.ignoredItemTypeIds).toEqual([AXE]);
  });

  it("refuses a second update while one is still in flight", () => {
    const handler = makeHandler(seededStore());
    const { session, errors } = makeSession("char-1");

    handler.handleUpdate(session, {
      type: "update-loot-filter",
      filter: { enabled: true, ignoredItemTypeIds: [] },
    });
    handler.handleUpdate(session, {
      type: "update-loot-filter",
      filter: { enabled: false, ignoredItemTypeIds: [] },
    });

    expect(errors).toEqual(["loot-filter-update-pending"]);
    expect(session.lootFilter.enabled).toBe(true);
  });

  it("rolls the session back when the durable write fails", async () => {
    const store = seededStore();
    const failing = {
      ...store,
      updateLootFilter: () => Promise.reject(new Error("db down")),
    } as unknown as CharacterStore;
    const handler = makeHandler(failing);
    const { session, sent, errors } = makeSession("char-1");

    handler.handleUpdate(session, {
      type: "update-loot-filter",
      filter: { enabled: true, ignoredItemTypeIds: [AXE] },
    });
    await settle(handler);

    expect(errors).toEqual(["loot-filter-update-failed"]);
    expect(session.lootFilter).toEqual({
      enabled: false,
      ignoredItemTypeIds: [],
    });
    expect(sent.at(-1)).toMatchObject({
      type: "loot-filter-updated",
      filter: { enabled: false, ignoredItemTypeIds: [] },
    });
  });

  it("lists carried types with summed counts plus blacklisted types not held", () => {
    const handler = makeHandler(seededStore(), [
      { typeId: GOLD, count: 40 },
      { typeId: GOLD, count: 60 },
    ]);
    const { session, sent } = makeSession("char-1", {
      enabled: true,
      ignoredItemTypeIds: [GOLD, AXE],
    });

    handler.handleItemsGet(session, 0);

    expect(sent.at(-1)).toEqual({
      type: "loot-filter-items",
      carried: [
        { typeId: GOLD, name: "gold coin", spriteId: 100, count: 100 },
      ],
      ignored: [{ typeId: AXE, name: "axe", spriteId: 200 }],
    });
  });

  it("throttles repeated item listings", () => {
    const handler = makeHandler(seededStore());
    const { session, sent } = makeSession("char-1");

    handler.handleItemsGet(session, 0);
    handler.handleItemsGet(session, 500);
    expect(sent).toHaveLength(1);

    handler.handleItemsGet(session, 1_000);
    expect(sent).toHaveLength(2);
  });
});
