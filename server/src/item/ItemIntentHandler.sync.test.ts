import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { loadItemCatalog } from "./loadItemCatalog";
import { MemoryItemStore } from "./MemoryItemStore";

const CHARACTER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";
const BACKPACK_ID = "41868798-fc9b-43ac-bf28-4f52bf64c4eb";
const AXE_A_ID = "434b8502-04e2-4e3b-875d-f9be2153016c";
const AXE_B_ID = "b676077c-f53f-49cc-89a7-ab4c7ca196ef";
const GOLD_ID = "97f88f8b-1ac2-4bf5-9272-906666c7d870";
const BACKPACK_TYPE = 2854;
const AXE_TYPE = 3274;
const GOLD_TYPE = 3031;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function carriedFixture(): Item[] {
  return [
    {
      id: BACKPACK_ID,
      typeId: BACKPACK_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "equipment",
        characterId: CHARACTER_ID,
        slot: "backpack",
      },
    },
    {
      id: AXE_A_ID,
      typeId: AXE_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
    },
    {
      id: AXE_B_ID,
      typeId: AXE_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 2 },
    },
    {
      id: GOLD_ID,
      typeId: GOLD_TYPE,
      count: 50,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 3 },
    },
  ];
}

function makeHarness(store: MemoryItemStore) {
  const world = new World(
    gridMapData({ name: "test", width: 3, height: 3, blocked: [] }),
    25,
  );
  const player = new Player(makeCharacter(CHARACTER_ID, "Sync Tester"), {
    x: 1,
    y: 1,
    z: 7,
  });
  world.addPlayer(player);
  const sent: ServerMessage[] = [];
  const terminate = vi.fn();
  const socket = {
    OPEN: 1,
    readyState: 1,
    on: vi.fn(),
    terminate,
    send: (value: string) => sent.push(JSON.parse(value) as ServerMessage),
  } as unknown as WebSocket;
  const session = new Session("session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = CHARACTER_ID;
  const handler = new ItemIntentHandler(
    store,
    catalog,
    world,
    new Visibility(world, new SessionRegistry()),
  );
  return { handler, session, sent, terminate, world };
}

describe("ItemIntentHandler memory-first carried ops", () => {
  it("answers a container move in the same tick", async () => {
    const store = new MemoryItemStore(catalog);
    for (const item of carriedFixture()) store.seed(item);
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "move-item",
      itemId: AXE_A_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 0,
    });

    expect(sent.at(-1)).toMatchObject({ type: "inventory-updated" });
    const snapshot = handler.inventorySnapshot(CHARACTER_ID);
    expect(
      snapshot?.items.find((item) => item.id === AXE_A_ID),
    ).toMatchObject({
      version: 2,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    });
  });

  it("lets exactly one of two racing identical moves succeed", async () => {
    const store = new MemoryItemStore(catalog);
    for (const item of carriedFixture()) store.seed(item);
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));
    const move = {
      type: "move-item" as const,
      itemId: AXE_A_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 0,
    };

    handler.handle(session, move);
    handler.handle(session, move);
    handler.detach(CHARACTER_ID);
    const durable = await handler.load(CHARACTER_ID, 400);

    expect(sent.at(-1)).toMatchObject({ type: "error" });
    expect(
      durable.items.filter((item) => item.id === AXE_A_ID),
    ).toHaveLength(1);
    expect(
      durable.items.find((item) => item.id === AXE_A_ID),
    ).toMatchObject({ version: 2 });
  });

  it("swaps two items when moving onto an occupied slot", async () => {
    const store = new MemoryItemStore(catalog);
    for (const item of carriedFixture()) store.seed(item);
    const { handler, session } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "move-item",
      itemId: AXE_A_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 2,
    });

    const snapshot = handler.inventorySnapshot(CHARACTER_ID);
    expect(
      snapshot?.items.find((item) => item.id === AXE_A_ID)?.location,
    ).toMatchObject({ containerId: BACKPACK_ID, slot: 2 });
    expect(
      snapshot?.items.find((item) => item.id === AXE_B_ID)?.location,
    ).toMatchObject({ containerId: BACKPACK_ID, slot: 1 });
    handler.detach(CHARACTER_ID);
    const durable = await handler.load(CHARACTER_ID, 400);
    expect(
      durable.items.find((item) => item.id === AXE_B_ID),
    ).toMatchObject({
      version: 2,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
    });
  });

  it("splits a stack and merges it back without duplication", async () => {
    const store = new MemoryItemStore(catalog);
    for (const item of carriedFixture()) store.seed(item);
    const { handler, session } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "split-stack",
      itemId: GOLD_ID,
      revision: 1,
      count: 20,
    });
    const afterSplit = handler.inventorySnapshot(CHARACTER_ID);
    const created = afterSplit?.items.find(
      (item) => item.typeId === GOLD_TYPE && item.id !== GOLD_ID,
    );
    if (!created || created.location.kind !== "container") {
      throw new Error("split did not create a stack");
    }
    expect(
      afterSplit?.items.find((item) => item.id === GOLD_ID)?.count,
    ).toBe(30);

    handler.handle(session, {
      type: "move-item",
      itemId: created.id,
      revision: created.version,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 3,
    });

    const merged = handler
      .inventorySnapshot(CHARACTER_ID)
      ?.items.filter((item) => item.typeId === GOLD_TYPE);
    expect(merged).toHaveLength(1);
    expect(merged?.[0]).toMatchObject({ id: GOLD_ID, count: 50 });
    handler.detach(CHARACTER_ID);
    const durable = await handler.load(CHARACTER_ID, 400);
    expect(
      durable.items
        .filter((item) => item.typeId === GOLD_TYPE)
        .reduce((total, item) => total + item.count, 0),
    ).toBe(50);
  });

  it("rejects DB-first consumption while memory-first writes are flushing", async () => {
    const FOOD_TYPE = 3577;
    const food: Item = {
      id: "dddd1111-1111-4111-8111-111111111111",
      typeId: FOOD_TYPE,
      count: 2,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 5 },
    };
    const store = new MemoryItemStore(catalog);
    for (const item of [...carriedFixture(), food]) store.seed(item);
    let release: (() => void) | undefined;
    const originalPersist = store.persist.bind(store);
    store.persist = (plan) =>
      new Promise<void>((resolve) => {
        release = () => resolve(originalPersist(plan));
      });
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "move-item",
      itemId: AXE_A_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 0,
    });
    handler.handle(session, {
      type: "use-item",
      itemId: food.id,
      revision: 1,
    });

    expect(session.itemPersistsPending).toBe(1);
    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    await nextTurn();
    release?.();
    await nextTurn();
    handler.applyResolvedOutcomes(Date.now());
    expect(session.itemPersistsPending).toBe(0);
  });

  it("drops and picks up a container preserving its contents", async () => {
    const store = new MemoryItemStore(catalog);
    const POUCH_TYPE = 2853;
    const pouch: Item = {
      id: "eeee1111-1111-4111-8111-111111111111",
      typeId: POUCH_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 5 },
    };
    const keepsake: Item = {
      id: "ffff1111-1111-4111-8111-111111111111",
      typeId: AXE_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: pouch.id, slot: 0 },
    };
    for (const item of [...carriedFixture(), pouch, keepsake]) store.seed(item);
    const { handler, session, world } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "drop-item",
      itemId: pouch.id,
      revision: 1,
      position: { x: 1, y: 2, z: 7 },
    });

    expect(
      world.getMapItems({ x: 1, y: 2, z: 7 }).map((entry) => entry.instanceId),
    ).toContain(pouch.id);
    expect(
      handler
        .inventorySnapshot(CHARACTER_ID)
        ?.items.some((entry) => entry.id === keepsake.id),
    ).toBe(false);

    handler.handle(session, {
      type: "pickup-item",
      itemId: pouch.id,
      revision: 2,
      position: { x: 1, y: 2, z: 7 },
    });

    expect(world.getMapItems({ x: 1, y: 2, z: 7 })).toHaveLength(0);
    const snapshot = handler.inventorySnapshot(CHARACTER_ID);
    expect(snapshot?.items.some((entry) => entry.id === keepsake.id)).toBe(
      true,
    );
    handler.detach(CHARACTER_ID);
    const durable = await handler.load(CHARACTER_ID, 400);
    expect(durable.items.map((entry) => entry.id)).toContain(keepsake.id);
  });

  it("keeps cross-character world writes in enqueue order", async () => {
    const store = new MemoryItemStore(catalog);
    for (const item of carriedFixture()) store.seed(item);
    const order: string[] = [];
    const originalPersist = store.persist.bind(store);
    const gates: Array<() => void> = [];
    store.persist = (plan) =>
      new Promise<void>((resolve) => {
        gates.push(() => {
          order.push(plan.rowOps[0]?.kind ?? "none");
          resolve(originalPersist(plan));
        });
      });
    const { handler, session } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "drop-item",
      itemId: AXE_A_ID,
      revision: 1,
      position: { x: 1, y: 2, z: 7 },
    });
    handler.handle(session, {
      type: "pickup-item",
      itemId: AXE_A_ID,
      revision: 2,
      position: { x: 1, y: 2, z: 7 },
    });
    await nextTurn();
    // Only the first write may be running; the second waits in the lane.
    expect(gates).toHaveLength(1);
    gates.shift()?.();
    await nextTurn();
    expect(gates).toHaveLength(1);
    gates.shift()?.();
    await nextTurn();
    handler.applyResolvedOutcomes(Date.now());
    expect(order).toEqual(["write", "write"]);
    expect(session.itemPersistsPending).toBe(0);
  });

  it("equips a backpack from the ground with nothing equipped", async () => {
    const store = new MemoryItemStore(catalog);
    const groundBackpack: Item = {
      id: "cccc1111-1111-4111-8111-111111111111",
      typeId: BACKPACK_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "world",
        position: { x: 1, y: 2, z: 7 },
        stackIndex: 1,
      },
    };
    store.seed(groundBackpack);
    const { handler, session, world } = makeHarness(store);
    world.applyCreatedWorldItems([groundBackpack]);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "pickup-item",
      itemId: groundBackpack.id,
      revision: 1,
      position: { x: 1, y: 2, z: 7 },
      equipSlot: "backpack",
    });
    await nextTurn();
    handler.applyResolvedOutcomes(Date.now());

    expect(
      handler
        .inventorySnapshot(CHARACTER_ID)
        ?.items.find((item) => item.id === groundBackpack.id)?.location,
    ).toMatchObject({ kind: "equipment", slot: "backpack" });
    handler.detach(CHARACTER_ID);
    const durable = await handler.load(CHARACTER_ID, 400);
    expect(
      durable.items.find((item) => item.id === groundBackpack.id)?.location,
    ).toMatchObject({ kind: "equipment", slot: "backpack" });
  });

  it("equips an item picked up from the ground in one intent", async () => {
    const store = new MemoryItemStore(catalog);
    for (const item of carriedFixture()) store.seed(item);
    const HELMET_TYPE = 3355;
    const groundHelmet: Item = {
      id: "aaaa1111-1111-4111-8111-111111111111",
      typeId: HELMET_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "world",
        position: { x: 1, y: 2, z: 7 },
        stackIndex: 1,
      },
    };
    store.seed(groundHelmet);
    const { handler, session, world } = makeHarness(store);
    world.applyCreatedWorldItems([groundHelmet]);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "pickup-item",
      itemId: groundHelmet.id,
      revision: 1,
      position: { x: 1, y: 2, z: 7 },
      equipSlot: "helmet",
    });
    await nextTurn();
    handler.applyResolvedOutcomes(Date.now());

    const equipped = handler
      .inventorySnapshot(CHARACTER_ID)
      ?.items.find((item) => item.id === groundHelmet.id);
    expect(equipped?.location).toMatchObject({
      kind: "equipment",
      slot: "helmet",
    });
    handler.detach(CHARACTER_ID);
    const durable = await handler.load(CHARACTER_ID, 400);
    expect(
      durable.items.find((item) => item.id === groundHelmet.id)?.location,
    ).toMatchObject({ kind: "equipment", slot: "helmet" });
  });

  it("rejects an equip-slot pickup whose type does not fit the slot", async () => {
    const store = new MemoryItemStore(catalog);
    for (const item of carriedFixture()) store.seed(item);
    const groundAxe: Item = {
      id: "bbbb1111-1111-4111-8111-111111111111",
      typeId: AXE_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "world",
        position: { x: 1, y: 2, z: 7 },
        stackIndex: 1,
      },
    };
    store.seed(groundAxe);
    const { handler, session, sent, world } = makeHarness(store);
    world.applyCreatedWorldItems([groundAxe]);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "pickup-item",
      itemId: groundAxe.id,
      revision: 1,
      position: { x: 1, y: 2, z: 7 },
      equipSlot: "helmet",
    });

    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(world.getMapItems({ x: 1, y: 2, z: 7 })).toHaveLength(1);
  });

  it("disconnects the session when a carried persist write fails", async () => {
    const store = new MemoryItemStore(catalog);
    for (const item of carriedFixture()) store.seed(item);
    store.persist = async () => {
      throw new Error("db down");
    };
    const { handler, session, terminate } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "move-item",
      itemId: AXE_A_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 0,
    });
    await nextTurn();
    handler.applyResolvedOutcomes(Date.now());

    expect(terminate).toHaveBeenCalled();
    expect(session.itemPersistsPending).toBe(0);
  });
});
