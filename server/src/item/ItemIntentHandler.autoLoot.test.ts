import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LootFilter, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { Player } from "../Player";
import { Session } from "../Session";
import { gridMapData } from "../gridMapData";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { DecayManager } from "./DecayManager";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { loadItemCatalog } from "./loadItemCatalog";
import { MemoryItemStore } from "./MemoryItemStore";

const KILLER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";
const RIVAL_ID = "9c1de0aa-1111-4222-8333-abcdefabcdef";
const KILLER_BACKPACK_ID = "41868798-fc9b-43ac-bf28-4f52bf64c4eb";
const RIVAL_BACKPACK_ID = "52979809-0dac-44bd-9c39-5063c075d5fc";
/** Dead chicken: a container corpse. */
const CORPSE_TYPE = 6042;
const GOLD_TYPE = 3031;
const AXE_TYPE = 3274;
const BACKPACK_TYPE = 2854;
const CORPSE_POSITION = { x: 1, y: 2, z: 7 };
/** Same floor, six tiles away — well outside the one-tile reach check. */
const FAR_POSITION = { x: 8, y: 8, z: 7 };

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function makeSession(characterId: string, filter: LootFilter) {
  const sent: ServerMessage[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    on: vi.fn(),
    send: vi.fn((value: string) => {
      sent.push(JSON.parse(value) as ServerMessage);
    }),
  } as unknown as WebSocket;
  const session = new Session(characterId, "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = characterId;
  session.lootFilter = filter;
  return { session, sent };
}

function backpackFor(characterId: string, backpackId: string): Item {
  return {
    id: backpackId,
    typeId: BACKPACK_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId, slot: "backpack" },
  };
}

async function settle(items: ItemIntentHandler, now: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  items.applyResolvedOutcomes(now);
}

async function makeHarness(input: {
  filter: LootFilter;
  corpseOwnerId?: string | null;
  killerPosition?: { x: number; y: number; z: number };
  carriedItems?: ReadonlyArray<Item>;
  /** Oz of capacity; raise it when the filler items would hit the cap first. */
  capacityMax?: number;
}) {
  const world = new World(
    gridMapData({ name: "auto-loot-test", width: 12, height: 12, blocked: [] }),
    25,
  );
  const registry = {
    all: () => [],
    sessionFor: () => undefined,
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const store = new MemoryItemStore(catalog);
  store.seed(backpackFor(KILLER_ID, KILLER_BACKPACK_ID));
  store.seed(backpackFor(RIVAL_ID, RIVAL_BACKPACK_ID));
  for (const item of input.carriedItems ?? []) store.seed(item);
  const items = new ItemIntentHandler(
    store,
    catalog,
    world,
    visibility,
    new DecayManager(catalog),
  );
  const killerPlayer = new Player(
    makeCharacter(KILLER_ID, "Killer"),
    input.killerPosition ?? { x: 1, y: 1, z: 7 },
  );
  const rivalPlayer = new Player(makeCharacter(RIVAL_ID, "Rival"), {
    x: 2,
    y: 2,
    z: 7,
  });
  world.addPlayer(killerPlayer);
  world.addPlayer(rivalPlayer);
  items.attach(await items.load(KILLER_ID, input.capacityMax ?? 400));
  items.attach(await items.load(RIVAL_ID, 400));
  const corpseId = items.createCorpse(
    input.corpseOwnerId === undefined ? KILLER_ID : input.corpseOwnerId,
    "death:auto-loot-1",
    CORPSE_POSITION,
    0,
    CORPSE_TYPE,
    [
      { typeId: GOLD_TYPE, count: 10 },
      { typeId: AXE_TYPE, count: 1 },
    ],
    0,
  );
  if (!corpseId) throw new Error("corpse was not created");
  await settle(items, 0);
  const killer = makeSession(KILLER_ID, input.filter);
  return { world, items, corpseId, killer };
}

/**
 * Fills the equipped backpack: a nested bag in slot 0 and axes in the rest, so
 * the only remaining room in the whole tree is inside the nested bag.
 */
function fullBackpackWithNestedBag(nestedBagId: string): Item[] {
  const capacity = 20;
  const nested: Item = {
    id: nestedBagId,
    typeId: BACKPACK_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: KILLER_BACKPACK_ID, slot: 0 },
  };
  const filler = Array.from({ length: capacity - 1 }, (_, index) => ({
    id: randomUUID(),
    typeId: AXE_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: {
      kind: "container" as const,
      containerId: KILLER_BACKPACK_ID,
      slot: index + 1,
    },
  }));
  return [nested, ...filler];
}

function childrenOf(
  items: ItemIntentHandler,
  characterId: string,
  containerId: string,
): ReadonlyArray<Item> {
  return (items.inventorySnapshot(characterId)?.items ?? []).filter(
    (item) =>
      item.location.kind === "container" &&
      item.location.containerId === containerId,
  );
}

function corpseChildren(world: World, corpseId: string): ReadonlyArray<Item> {
  return world.getWorldSubtree(corpseId).slice(1);
}

function carriedTypeIds(
  items: ItemIntentHandler,
  characterId: string,
): ReadonlyArray<number> {
  return (items.inventorySnapshot(characterId)?.items ?? []).map(
    (item) => item.typeId,
  );
}

describe("auto loot", () => {
  it("sweeps the whole corpse when nothing is blacklisted", async () => {
    const harness = await makeHarness({
      filter: { enabled: true, ignoredItemTypeIds: [] },
    });

    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    await settle(harness.items, 0);

    expect(corpseChildren(harness.world, harness.corpseId)).toEqual([]);
    expect(carriedTypeIds(harness.items, KILLER_ID)).toEqual(
      expect.arrayContaining([GOLD_TYPE, AXE_TYPE]),
    );
  });

  it("leaves a blacklisted type in the corpse and takes the rest", async () => {
    const harness = await makeHarness({
      filter: { enabled: true, ignoredItemTypeIds: [AXE_TYPE] },
    });

    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    await settle(harness.items, 0);

    expect(
      corpseChildren(harness.world, harness.corpseId).map((item) => item.typeId),
    ).toEqual([AXE_TYPE]);
    const carried = carriedTypeIds(harness.items, KILLER_ID);
    expect(carried).toContain(GOLD_TYPE);
    expect(carried).not.toContain(AXE_TYPE);
  });

  it("takes nothing while the filter is switched off", async () => {
    const harness = await makeHarness({
      filter: { enabled: false, ignoredItemTypeIds: [] },
    });

    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    await settle(harness.items, 0);

    expect(corpseChildren(harness.world, harness.corpseId)).toHaveLength(2);
    expect(carriedTypeIds(harness.items, KILLER_ID)).not.toContain(GOLD_TYPE);
  });

  it("takes nothing when the killer is out of reach of the corpse", async () => {
    const harness = await makeHarness({
      filter: { enabled: true, ignoredItemTypeIds: [] },
      killerPosition: FAR_POSITION,
    });

    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    await settle(harness.items, 0);

    expect(corpseChildren(harness.world, harness.corpseId)).toHaveLength(2);
  });

  it("never sweeps a corpse owned by someone else", async () => {
    const harness = await makeHarness({
      filter: { enabled: true, ignoredItemTypeIds: [] },
      corpseOwnerId: RIVAL_ID,
    });

    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    await settle(harness.items, 0);

    expect(corpseChildren(harness.world, harness.corpseId)).toHaveLength(2);
    expect(carriedTypeIds(harness.items, KILLER_ID)).not.toContain(GOLD_TYPE);
  });

  it("fills a bag nested inside a full backpack instead of giving up", async () => {
    const nestedBagId = randomUUID();
    const harness = await makeHarness({
      filter: { enabled: true, ignoredItemTypeIds: [] },
      carriedItems: fullBackpackWithNestedBag(nestedBagId),
      capacityMax: 5_000,
    });

    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    await settle(harness.items, 0);

    expect(corpseChildren(harness.world, harness.corpseId)).toEqual([]);
    expect(
      childrenOf(harness.items, KILLER_ID, nestedBagId)
        .map((item) => item.typeId)
        .sort(),
    ).toEqual([GOLD_TYPE, AXE_TYPE].sort());
  });

  it("tops up a partial stack sitting in a nested bag", async () => {
    const nestedBagId = randomUUID();
    const existingGoldId = randomUUID();
    const carried = fullBackpackWithNestedBag(nestedBagId);
    const harness = await makeHarness({
      filter: { enabled: true, ignoredItemTypeIds: [AXE_TYPE] },
      carriedItems: [
        ...carried,
        {
          id: existingGoldId,
          typeId: GOLD_TYPE,
          count: 50,
          attributes: {},
          version: 1,
          location: { kind: "container", containerId: nestedBagId, slot: 0 },
        },
      ],
      capacityMax: 5_000,
    });

    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    await settle(harness.items, 0);

    const gold = childrenOf(harness.items, KILLER_ID, nestedBagId).filter(
      (item) => item.typeId === GOLD_TYPE,
    );
    expect(gold).toHaveLength(1);
    expect(gold[0]?.count).toBe(60);
  });

  it("takes nothing when every container in the tree is full", async () => {
    const nestedBagId = randomUUID();
    const carried = fullBackpackWithNestedBag(nestedBagId);
    const harness = await makeHarness({
      filter: { enabled: true, ignoredItemTypeIds: [] },
      carriedItems: [
        ...carried,
        ...Array.from({ length: 20 }, (_, slot) => ({
          id: randomUUID(),
          typeId: AXE_TYPE,
          count: 1,
          attributes: {},
          version: 1,
          location: {
            kind: "container" as const,
            containerId: nestedBagId,
            slot,
          },
        })),
      ],
      capacityMax: 5_000,
    });

    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    await settle(harness.items, 0);

    expect(corpseChildren(harness.world, harness.corpseId)).toHaveLength(2);
  });

  it("cannot duplicate loot when the same corpse is swept twice", async () => {
    const harness = await makeHarness({
      filter: { enabled: true, ignoredItemTypeIds: [] },
    });

    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    harness.items.autoLoot(harness.killer.session, KILLER_ID, harness.corpseId, 0);
    await settle(harness.items, 0);

    expect(corpseChildren(harness.world, harness.corpseId)).toEqual([]);
    const carried = harness.items.inventorySnapshot(KILLER_ID)?.items ?? [];
    expect(carried.filter((item) => item.typeId === GOLD_TYPE)).toHaveLength(1);
    expect(carried.filter((item) => item.typeId === AXE_TYPE)).toHaveLength(1);
    expect(
      carried
        .filter((item) => item.typeId === GOLD_TYPE)
        .reduce((total, item) => total + item.count, 0),
    ).toBe(10);
  });
});
