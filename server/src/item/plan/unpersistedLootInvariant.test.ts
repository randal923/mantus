import { describe, expect, it } from "vitest";
import type { MapItem } from "../../MapItem";
import type { Item } from "../Item";
import { ItemCatalog } from "../ItemCatalog";
import type { ItemType } from "../ItemType";
import type { LootOrigin } from "../LootOrigin";
import { findUnpersistedGuardViolation } from "./findUnpersistedGuardViolation";
import { planDrop } from "./planDrop";
import { planMoveMapItem } from "./planMoveMapItem";
import type { WorldItemsView } from "./WorldItemsView";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARRIED_COINS_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOOT_COINS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GROUND_COINS_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COIN_TYPE = 3031;
const POSITION = { x: 10, y: 10, z: 7 };
const ORIGIN: LootOrigin = {
  eventId: "death:11111111-1111-4111-8111-111111111111",
  killerCharacterId: CHARACTER_ID,
};

const makeItemType = (
  overrides: Partial<ItemType> & { id: number },
): ItemType => ({
  clientId: overrides.id,
  name: `type-${overrides.id}`,
  spriteId: overrides.id,
  stackable: false,
  maxCount: 1,
  weight: 100,
  pickupable: true,
  movable: true,
  light: { intensity: 0, color: 0 },
  elevation: 0,
  render: {
    ground: false,
    groundBorder: false,
    onBottom: false,
    onTop: false,
    stackable: false,
    fluidContainer: false,
    splash: false,
    hangable: false,
    hookSouth: false,
    hookEast: false,
    lyingCorpse: false,
    animateAlways: false,
    topEffect: false,
  },
  ...overrides,
});

const catalog = new ItemCatalog([
  makeItemType({ id: COIN_TYPE, stackable: true, maxCount: 100, weight: 1 }),
]);

const coins = (id: string, count: number, stackIndex: number): Item => ({
  id,
  typeId: COIN_TYPE,
  count,
  attributes: {},
  version: 3,
  location: { kind: "world", position: { ...POSITION }, stackIndex },
});

/** A tile holding `groundItems`, with `unpersistedIds` having no DB row. */
function worldView(
  groundItems: ReadonlyArray<Item>,
  unpersistedIds: ReadonlySet<string>,
): WorldItemsView {
  return {
    getMapItems: (position) =>
      position.x === POSITION.x &&
      position.y === POSITION.y &&
      position.z === POSITION.z
        ? groundItems.map(
            (item): MapItem => ({
              instanceId: item.id,
              itemId: item.typeId,
              stackIndex:
                item.location.kind === "world" ? item.location.stackIndex : 0,
              mutable: true,
              revision: item.version,
              count: item.count,
            }),
          )
        : [],
    getWorldItem: (instanceId) =>
      groundItems.find((item) => item.id === instanceId),
    getWorldSubtree: (rootId) =>
      groundItems.filter((item) => item.id === rootId),
    lootOrigin: (itemId) =>
      unpersistedIds.has(itemId) ? ORIGIN : undefined,
    seedOrigin: () => undefined,
  };
}

describe("unpersisted-loot persist invariant", () => {
  it("planDrop inserts an unpersisted merge target instead of guarding it", () => {
    const lootStack = coins(LOOT_COINS_ID, 20, 0);
    const carried: Item = {
      id: CARRIED_COINS_ID,
      typeId: COIN_TYPE,
      count: 5,
      attributes: {},
      version: 2,
      location: { kind: "container", containerId: "bp", slot: 0 },
    };
    const world = worldView([lootStack], new Set([LOOT_COINS_ID]));

    const plan = planDrop({
      characterId: CHARACTER_ID,
      catalog,
      carried: { items: [carried] },
      world,
      itemId: carried.id,
      expectedVersion: carried.version,
      position: POSITION,
    });

    expect(plan).not.toBeNull();
    expect(findUnpersistedGuardViolation(world, plan!.persist)).toBeNull();
    expect(plan!.persist.rowOps).toContainEqual({
      kind: "insert",
      item: { ...lootStack, count: 25, version: 4 },
    });
    expect(plan!.persist.audits).toContainEqual({
      kind: "loot-created",
      itemId: LOOT_COINS_ID,
      eventId: ORIGIN.eventId,
      killerCharacterId: CHARACTER_ID,
      typeId: COIN_TYPE,
      count: 20,
    });
  });

  it("planDrop still guard-writes a persisted merge target", () => {
    const groundStack = coins(GROUND_COINS_ID, 20, 0);
    const carried: Item = {
      id: CARRIED_COINS_ID,
      typeId: COIN_TYPE,
      count: 5,
      attributes: {},
      version: 2,
      location: { kind: "container", containerId: "bp", slot: 0 },
    };
    const world = worldView([groundStack], new Set());

    const plan = planDrop({
      characterId: CHARACTER_ID,
      catalog,
      carried: { items: [carried] },
      world,
      itemId: carried.id,
      expectedVersion: carried.version,
      position: POSITION,
    });

    expect(plan!.persist.rowOps).toContainEqual({
      kind: "write",
      expectedVersion: 3,
      item: { ...groundStack, count: 25, version: 4 },
    });
    expect(
      plan!.persist.audits.some((audit) => audit.kind === "loot-created"),
    ).toBe(false);
  });

  it("planDrop's partial drop never guards an unpersisted merge target", () => {
    const lootStack = coins(LOOT_COINS_ID, 20, 0);
    const carried: Item = {
      id: CARRIED_COINS_ID,
      typeId: COIN_TYPE,
      count: 9,
      attributes: {},
      version: 2,
      location: { kind: "container", containerId: "bp", slot: 0 },
    };
    const world = worldView([lootStack], new Set([LOOT_COINS_ID]));

    const plan = planDrop({
      characterId: CHARACTER_ID,
      catalog,
      carried: { items: [carried] },
      world,
      itemId: carried.id,
      expectedVersion: carried.version,
      position: POSITION,
      requestedCount: 4,
    });

    expect(findUnpersistedGuardViolation(world, plan!.persist)).toBeNull();
  });

  it("planMoveMapItem never guards an unpersisted merge target", () => {
    const lootStack = coins(LOOT_COINS_ID, 20, 0);
    const groundStack = coins(GROUND_COINS_ID, 10, 1);
    const world = worldView(
      [lootStack, groundStack],
      new Set([LOOT_COINS_ID]),
    );

    const plan = planMoveMapItem({
      characterId: CHARACTER_ID,
      catalog,
      world,
      itemInstanceId: GROUND_COINS_ID,
      expectedVersion: groundStack.version,
      fromPosition: POSITION,
      toPosition: POSITION,
    });

    expect(plan).not.toBeNull();
    expect(findUnpersistedGuardViolation(world, plan!.persist)).toBeNull();
  });

  it("detects a guarded write against an unpersisted item", () => {
    const lootStack = coins(LOOT_COINS_ID, 20, 0);
    const world = worldView([lootStack], new Set([LOOT_COINS_ID]));

    expect(
      findUnpersistedGuardViolation(world, {
        characterId: CHARACTER_ID,
        rowOps: [{ kind: "write", expectedVersion: 3, item: lootStack }],
        audits: [],
      }),
    ).toBe(`write guards unpersisted item ${LOOT_COINS_ID}`);
  });

  it("accepts a guarded write that follows the item's own insert", () => {
    const lootStack = coins(LOOT_COINS_ID, 20, 0);
    const world = worldView([lootStack], new Set([LOOT_COINS_ID]));

    expect(
      findUnpersistedGuardViolation(world, {
        characterId: CHARACTER_ID,
        rowOps: [
          { kind: "insert", item: lootStack },
          { kind: "write", expectedVersion: 3, item: lootStack },
        ],
        audits: [],
      }),
    ).toBeNull();
  });
});
