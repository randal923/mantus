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
  [
    GOLD,
    {
      id: GOLD,
      name: "gold coin",
      spriteId: 100,
      pickupable: true,
      stackable: true,
      weight: 10,
    },
  ],
  // Rarity-eligible: a one-handed sword is exactly the gear a grade rolls on.
  [
    AXE,
    {
      id: AXE,
      name: "axe",
      spriteId: 200,
      pickupable: true,
      stackable: false,
      weight: 4_000,
      weaponType: "axe",
    },
  ],
]);

interface CarriedStub {
  readonly typeId: number;
  readonly count: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

function makeHandler(
  store: CharacterStore,
  carried: ReadonlyArray<CarriedStub> = [],
) {
  const registry = { contains: () => true } as unknown as SessionRegistry;
  const world = {
    getPlayer: (id: string) => (id === "char-1" ? { id } : undefined),
  } as unknown as World;
  const items = {
    itemType: (typeId: number) => CATALOG.get(typeId),
    inventorySnapshot: () => ({
      items: carried.map((item) => ({ attributes: {}, ...item })),
      capacityMax: 400,
      bankBalance: 0,
    }),
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
    lootFilter: filter ?? { ...DEFAULT_LOOT_FILTER, pickupRules: [] },
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
      filter: {
        enabled: true,
        pickupRules: [
          { typeId: GOLD },
          { typeId: UNKNOWN },
          { typeId: GOLD },
          { typeId: AXE },
        ],
      },
    });
    await settle(handler);

    expect(errors).toEqual([]);
    expect(session.lootFilter).toEqual({
      enabled: true,
      pickupRules: [{ typeId: GOLD }, { typeId: AXE }],
    });
    expect(sent.at(-1)).toMatchObject({
      type: "loot-filter-updated",
      filter: {
        enabled: true,
        pickupRules: [{ typeId: GOLD }, { typeId: AXE }],
      },
    });
    expect(store.get("char-1")?.lootFilter.pickupRules).toEqual([
      { typeId: GOLD },
      { typeId: AXE },
    ]);
  });

  it("keeps grades on gear that can roll one and strips them elsewhere", async () => {
    const handler = makeHandler(seededStore());
    const { session } = makeSession("char-1");

    handler.handleUpdate(session, {
      type: "update-loot-filter",
      filter: {
        enabled: true,
        pickupRules: [
          { typeId: AXE, rarities: ["rare", "epic", "rare"] },
          { typeId: GOLD, rarities: ["legendary"] },
        ],
      },
    });
    await settle(handler);

    expect(session.lootFilter.pickupRules).toEqual([
      { typeId: AXE, rarities: ["rare", "epic"] },
      { typeId: GOLD },
    ]);
  });

  it("applies the filter in memory before the write lands", () => {
    const handler = makeHandler(seededStore());
    const { session } = makeSession("char-1");

    handler.handleUpdate(session, {
      type: "update-loot-filter",
      filter: { enabled: true, pickupRules: [{ typeId: AXE }] },
    });

    expect(session.lootFilter.enabled).toBe(true);
    expect(session.lootFilter.pickupRules).toEqual([{ typeId: AXE }]);
  });

  it("refuses a second update while one is still in flight", () => {
    const handler = makeHandler(seededStore());
    const { session, errors } = makeSession("char-1");

    handler.handleUpdate(session, {
      type: "update-loot-filter",
      filter: { enabled: true, pickupRules: [] },
    });
    handler.handleUpdate(session, {
      type: "update-loot-filter",
      filter: { enabled: false, pickupRules: [] },
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
      filter: { enabled: true, pickupRules: [{ typeId: AXE }] },
    });
    await settle(handler);

    expect(errors).toEqual(["loot-filter-update-failed"]);
    expect(session.lootFilter).toEqual({
      enabled: false,
      pickupRules: [],
    });
    expect(sent.at(-1)).toMatchObject({
      type: "loot-filter-updated",
      filter: { enabled: false, pickupRules: [] },
    });
  });

  it("lists carried stacks by grade, with one ungraded entry per type", () => {
    const handler = makeHandler(seededStore(), [
      { typeId: GOLD, count: 40 },
      { typeId: GOLD, count: 60 },
      { typeId: AXE, count: 1, attributes: { rarity: "legendary" } },
      { typeId: AXE, count: 1 },
    ]);
    const { session, sent } = makeSession("char-1", {
      enabled: true,
      pickupRules: [{ typeId: GOLD }, { typeId: AXE }],
    });

    handler.handleItemsGet(session, 0);

    const listing = sent.at(-1);
    if (listing?.type !== "loot-filter-items") throw new Error("no listing");
    expect(
      listing.carried.map((item) => [
        item.name,
        item.tooltip.rarity,
        item.count,
      ]),
    ).toEqual([
      // The axe in the bag is a legendary axe and an ordinary one, not five
      // hypothetical grades of "axe"; stackable currency carries no grade.
      ["axe", "common", 1],
      ["axe", "legendary", 1],
      ["gold coin", undefined, 100],
    ]);
    expect(
      listing.types.map((item) => [item.typeId, item.tooltip.rarity]),
    ).toEqual([
      [AXE, "common"],
      [GOLD, undefined],
    ]);
    expect(listing.types.every((item) => item.count === undefined)).toBe(true);
  });

  it("lists a type it no longer carries so the rule stays removable", () => {
    const handler = makeHandler(seededStore());
    const { session, sent } = makeSession("char-1", {
      enabled: true,
      pickupRules: [{ typeId: AXE, rarities: ["rare"] }],
    });

    handler.handleItemsGet(session, 0);

    expect(sent.at(-1)).toMatchObject({
      type: "loot-filter-items",
      carried: [],
      types: [{ typeId: AXE, name: "axe", tooltip: { name: "Axe" } }],
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
