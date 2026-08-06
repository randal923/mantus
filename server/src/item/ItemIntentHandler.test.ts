import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage, ViewRange } from "@tibia/protocol";
import type { WebSocket } from "ws";
import type { MapItem } from "../MapItem";
import { Player } from "../Player";
import { Session } from "../Session";
import { gridMapData } from "../gridMapData";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { Item } from "./Item";
import { ItemCatalog } from "./ItemCatalog";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { loadItemCatalog } from "./loadItemCatalog";
import { MemoryItemStore } from "./MemoryItemStore";

const CHARACTER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";
const BACKPACK_ID = "41868798-fc9b-43ac-bf28-4f52bf64c4eb";
const POUCH_ID = "db85bce3-0fc9-49f4-87ff-dda53f3cc8c1";
const ITEM_ID = "434b8502-04e2-4e3b-875d-f9be2153016c";
const LETTER_ID = "b676077c-f53f-49cc-89a7-ab4c7ca196ef";
const FOOD_ID = "97f88f8b-1ac2-4bf5-9272-906666c7d870";
const WORLD_GOLD_ID = "5b9660ec-56c6-4f57-9c58-2b16dfbe1b8d";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

describe("ItemIntentHandler", () => {
  it("keeps the inventory capacity projection in sync with level gains", async () => {
    const world = new World(
      gridMapData({
        name: "test",
        width: 3,
        height: 3,
        blocked: [],
      }),
      25,
    );
    const handler = new ItemIntentHandler(
      new MemoryItemStore(),
      new ItemCatalog([]),
      world,
      new Visibility(world, new SessionRegistry()),
    );
    handler.attach(await handler.load("character-id", 400));

    expect(handler.updateCapacity("character-id", 425)).toMatchObject({
      revision: 1,
      capacityMax: 425,
    });
    expect(handler.updateCapacity("character-id", 425)).toBeNull();
  });

  it("opens nested containers and moves an item into a revisioned container", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "open-container",
      itemId: POUCH_ID,
      revision: 1,
    });
    expect(sent.at(-1)).toMatchObject({
      type: "inventory-updated",
      inventory: {
        containers: [
          {
            container: { id: POUCH_ID },
            items: [{ item: { id: ITEM_ID } }],
          },
        ],
      },
    });

    handler.handle(session, {
      type: "move-item",
      itemId: ITEM_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 1,
    });
    await handler.load(CHARACTER_ID, 400);
    handler.applyResolvedOutcomes(1_000);

    expect(sent.at(-1)).toMatchObject({
      type: "inventory-updated",
      inventory: {
        items: expect.arrayContaining([
          expect.objectContaining({
            slot: 1,
            item: expect.objectContaining({ id: ITEM_ID, revision: 2 }),
          }),
        ]),
        containers: [
          expect.objectContaining({
            container: expect.objectContaining({ id: POUCH_ID }),
            items: [],
          }),
        ],
      },
    });
  });

  it("consolidates partial stacks inside one carried container", async () => {
    const store = new MemoryItemStore();
    const [backpack] = nestedItems();
    store.seed(backpack!);
    const gold = (id: string, slot: number, count: number): Item => ({
      id,
      typeId: 3031,
      count,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot },
    });
    store.seed(gold("8b1f64f9-15a1-4d5e-9d54-40c2b4de1a01", 0, 60));
    store.seed({
      id: ITEM_ID,
      typeId: 3273,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
    });
    store.seed(gold("8b1f64f9-15a1-4d5e-9d54-40c2b4de1a02", 2, 60));
    store.seed(gold("8b1f64f9-15a1-4d5e-9d54-40c2b4de1a03", 3, 30));
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "stack-container",
      containerId: BACKPACK_ID,
    });
    await handler.stopPersists();

    expect(sent.some((message) => message.type === "error")).toBe(false);
    const goldCounts = handler
      .inventorySnapshot(CHARACTER_ID)!
      .items.filter((entry) => entry.typeId === 3031)
      .map((entry) => entry.count)
      .sort((a, b) => b - a);
    expect(goldCounts).toEqual([100, 50]);
  });

  it("sorts a carried container into contiguous slots and stays idempotent", async () => {
    const store = new MemoryItemStore();
    const [backpack] = nestedItems();
    store.seed(backpack!);
    store.seed({
      id: ITEM_ID,
      typeId: 3273,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 5 },
    });
    store.seed({
      id: "8b1f64f9-15a1-4d5e-9d54-40c2b4de1a04",
      typeId: 3031,
      count: 30,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 3 },
    });
    store.seed({
      id: "8b1f64f9-15a1-4d5e-9d54-40c2b4de1a05",
      typeId: 3031,
      count: 20,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 7 },
    });
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "sort-container",
      containerId: BACKPACK_ID,
    });
    await handler.stopPersists();

    expect(sent.some((message) => message.type === "error")).toBe(false);
    const slots = handler
      .inventorySnapshot(CHARACTER_ID)!
      .items.flatMap((entry) =>
        entry.location.kind === "container" &&
        entry.location.containerId === BACKPACK_ID
          ? [entry.location.slot]
          : [],
      )
      .sort((a, b) => a - b);
    expect(slots).toEqual([0, 1, 2]);

    const sentBefore = sent.length;
    handler.handle(session, {
      type: "sort-container",
      containerId: BACKPACK_ID,
    });
    await handler.stopPersists();
    expect(sent.length).toBe(sentBefore);
  });

  it("rejects stack and sort for containers the character does not carry", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    const foreignId = "d6a7e8f9-0a1b-4c2d-8e3f-4a5b6c7d8e9f";
    handler.handle(session, {
      type: "stack-container",
      containerId: foreignId,
    });
    expect(sent.at(-1)).toMatchObject({ type: "error" });
    handler.handle(session, {
      type: "sort-container",
      containerId: foreignId,
    });
    expect(sent.at(-1)).toMatchObject({ type: "error" });
  });

  it("throws a visible map item onto a nearby tile", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const worldGold: Item = {
      id: WORLD_GOLD_ID,
      typeId: 3031,
      count: 10,
      attributes: {},
      version: 1,
      location: {
        kind: "world",
        position: { x: 1, y: 2, z: 7 },
        stackIndex: 1,
      },
    };
    store.seed(worldGold);
    const { handler, session, sent, world } = makeHarness(store);
    world.applyCreatedWorldItems([worldGold]);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "move-map-item",
      itemId: WORLD_GOLD_ID,
      revision: 1,
      fromPosition: { x: 1, y: 2, z: 7 },
      toPosition: { x: 2, y: 2, z: 7 },
    });
    await handler.load(CHARACTER_ID, 400);
    handler.applyResolvedOutcomes(1_000);

    expect(sent.some((message) => message.type === "error")).toBe(false);
    expect(world.getMapItems({ x: 1, y: 2, z: 7 })).toHaveLength(0);
    expect(world.getMapItems({ x: 2, y: 2, z: 7 })).toMatchObject([
      { instanceId: WORLD_GOLD_ID, count: 10 },
    ]);
  });

  it("drops an inventory item throughout the current unobstructed viewport", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const target = { x: 10, y: 2, z: 7 };
    const { handler, session, sent, world } = makeHarness(store, {
      width: 20,
      height: 5,
      playerPosition: { x: 2, y: 2, z: 7 },
      viewRange: { x: 9, y: 2 },
    });
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "drop-item",
      itemId: ITEM_ID,
      revision: 1,
      position: target,
    });
    await handler.stopPersists();

    expect(sent.some((message) => message.type === "error")).toBe(false);
    expect(
      handler
        .inventorySnapshot(CHARACTER_ID)
        ?.items.some((item) => item.id === ITEM_ID),
    ).toBe(false);
    expect(world.getMapItems(target)).toMatchObject([
      { instanceId: ITEM_ID, revision: 2 },
    ]);
  });

  it("rejects inventory drops behind walls or outside the current viewport", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const { handler, session, sent, world } = makeHarness(store, {
      width: 20,
      height: 5,
      blocked: [[6, 2]],
      playerPosition: { x: 2, y: 2, z: 7 },
      viewRange: { x: 9, y: 2 },
    });
    handler.attach(await handler.load(CHARACTER_ID, 400));

    for (const position of [
      { x: 10, y: 2, z: 7 },
      { x: 12, y: 2, z: 7 },
    ]) {
      handler.handle(session, {
        type: "drop-item",
        itemId: ITEM_ID,
        revision: 1,
        position,
      });
      expect(sent.at(-1)).toMatchObject({
        type: "error",
        code: "item-action-failed",
      });
      expect(world.getMapItems(position)).toHaveLength(0);
    }
    expect(
      handler
        .inventorySnapshot(CHARACTER_ID)
        ?.items.some((item) => item.id === ITEM_ID),
    ).toBe(true);
  });

  it("throws a map item throughout the current unobstructed viewport", async () => {
    const store = new MemoryItemStore();
    const source = { x: 3, y: 2, z: 7 };
    const target = { x: 10, y: 2, z: 7 };
    const worldGold: Item = {
      id: WORLD_GOLD_ID,
      typeId: 3031,
      count: 10,
      attributes: {},
      version: 1,
      location: { kind: "world", position: source, stackIndex: 1 },
    };
    store.seed(worldGold);
    const { handler, session, sent, world } = makeHarness(store, {
      width: 20,
      height: 5,
      playerPosition: { x: 2, y: 2, z: 7 },
      viewRange: { x: 9, y: 2 },
    });
    world.applyCreatedWorldItems([worldGold]);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "move-map-item",
      itemId: WORLD_GOLD_ID,
      revision: 1,
      fromPosition: source,
      toPosition: target,
    });
    await handler.stopPersists();

    expect(sent.some((message) => message.type === "error")).toBe(false);
    expect(world.getMapItems(source)).toHaveLength(0);
    expect(world.getMapItems(target)).toMatchObject([
      { instanceId: WORLD_GOLD_ID, revision: 2 },
    ]);
  });

  it("rejects map item throws behind walls or outside the current viewport", async () => {
    const store = new MemoryItemStore();
    const source = { x: 3, y: 2, z: 7 };
    const worldGold: Item = {
      id: WORLD_GOLD_ID,
      typeId: 3031,
      count: 10,
      attributes: {},
      version: 1,
      location: { kind: "world", position: source, stackIndex: 1 },
    };
    store.seed(worldGold);
    const { handler, session, sent, world } = makeHarness(store, {
      width: 20,
      height: 5,
      blocked: [[6, 2]],
      playerPosition: { x: 2, y: 2, z: 7 },
      viewRange: { x: 9, y: 2 },
    });
    world.applyCreatedWorldItems([worldGold]);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    for (const toPosition of [
      { x: 10, y: 2, z: 7 },
      { x: 12, y: 2, z: 7 },
    ]) {
      handler.handle(session, {
        type: "move-map-item",
        itemId: WORLD_GOLD_ID,
        revision: 1,
        fromPosition: source,
        toPosition,
      });
      expect(sent.at(-1)).toMatchObject({
        type: "error",
        code: "item-action-failed",
      });
    }
    expect(world.getMapItems(source)).toMatchObject([
      { instanceId: WORLD_GOLD_ID, revision: 1 },
    ]);
  });

  it("rejects a drop or throw whose line of sight is blocked by a wall", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const from = { x: 2, y: 2, z: 7 };
    const worldGold: Item = {
      id: WORLD_GOLD_ID,
      typeId: 3031,
      count: 5,
      attributes: {},
      version: 1,
      location: { kind: "world", position: from, stackIndex: 1 },
    };
    store.seed(worldGold);
    const { handler, session, sent, world } = makeHarness(store, {
      width: 10,
      height: 5,
      blocked: [[4, 2]],
      playerPosition: from,
      viewRange: { x: 9, y: 7 },
    });
    world.applyCreatedWorldItems([worldGold]);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    // Throwing the grounded gold across the wall at (4,2) has no line of sight.
    handler.handle(session, {
      type: "move-map-item",
      itemId: WORLD_GOLD_ID,
      revision: 1,
      fromPosition: from,
      toPosition: { x: 6, y: 2, z: 7 },
    });
    expect(sent.at(-1)).toMatchObject({ type: "error", code: "item-action-failed" });
    expect(world.getMapItems({ x: 6, y: 2, z: 7 })).toEqual([]);
    expect(world.getMapItems(from)).toMatchObject([{ instanceId: WORLD_GOLD_ID }]);

    // Dropping a carried item across the same wall is rejected for the same reason.
    handler.handle(session, {
      type: "drop-item",
      itemId: ITEM_ID,
      revision: 1,
      position: { x: 6, y: 2, z: 7 },
    });
    expect(sent.at(-1)).toMatchObject({ type: "error", code: "item-action-failed" });
    expect(
      handler
        .inventorySnapshot(CHARACTER_ID)
        ?.items.find((item) => item.id === ITEM_ID),
    ).toBeDefined();

    // Control: a clear-line throw to (2,4) is accepted — the rejection above is
    // line of sight, not a blanket block on the range.
    handler.handle(session, {
      type: "move-map-item",
      itemId: WORLD_GOLD_ID,
      revision: 1,
      fromPosition: from,
      toPosition: { x: 2, y: 4, z: 7 },
    });
    expect(
      world
        .getMapItems({ x: 2, y: 4, z: 7 })
        .some((item) => item.instanceId === WORLD_GOLD_ID),
    ).toBe(true);
  });

  it("rejects throws to missing tiles, other floors, or stale revisions", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const worldGold: Item = {
      id: WORLD_GOLD_ID,
      typeId: 3031,
      count: 10,
      attributes: {},
      version: 1,
      location: {
        kind: "world",
        position: { x: 1, y: 2, z: 7 },
        stackIndex: 1,
      },
    };
    store.seed(worldGold);
    const { handler, session, sent, world } = makeHarness(store);
    world.applyCreatedWorldItems([worldGold]);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    const attempts = [
      { toPosition: { x: 5, y: 2, z: 7 }, revision: 1 },
      { toPosition: { x: 2, y: 2, z: 6 }, revision: 1 },
      { toPosition: { x: 2, y: 2, z: 7 }, revision: 9 },
    ];
    for (const attempt of attempts) {
      handler.handle(session, {
        type: "move-map-item",
        itemId: WORLD_GOLD_ID,
        revision: attempt.revision,
        fromPosition: { x: 1, y: 2, z: 7 },
        toPosition: attempt.toPosition,
      });
      expect(sent.at(-1)).toMatchObject({
        type: "error",
        code: "item-action-failed",
      });
    }
    expect(world.getMapItems({ x: 1, y: 2, z: 7 })).toMatchObject([
      { instanceId: WORLD_GOLD_ID },
    ]);
  });

  it("throttles action-bar item uses to one per 200 ms exhaust window", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    store.seed({
      id: LETTER_ID,
      typeId: 3505,
      count: 1,
      attributes: { text: "Read me" },
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 2 },
    });
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    const textCount = () =>
      sent.filter((message) => message.type === "item-text").length;

    // First use fires and arms the exhaust.
    expect(handler.activateOwnedItem(session, 3505, "use", null, 0)).toBe(true);
    expect(textCount()).toBe(1);
    // A replay 100 ms later is inside the exhaust window: rejected, no re-use.
    expect(handler.activateOwnedItem(session, 3505, "use", null, 100)).toBe(
      false,
    );
    expect(textCount()).toBe(1);
    // 199 ms is still exhausted; 200 ms clears the window.
    expect(handler.activateOwnedItem(session, 3505, "use", null, 199)).toBe(
      false,
    );
    expect(textCount()).toBe(1);
    expect(handler.activateOwnedItem(session, 3505, "use", null, 200)).toBe(
      true,
    );
    expect(textCount()).toBe(2);
  });

  it("destroys a carried item dropped onto a trashholder tile", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    // 622 = "water", a trashholder-kind static map item on the destination tile.
    const water: MapItem = {
      instanceId: "water-1-2",
      itemId: 622,
      stackIndex: 0,
      mutable: false,
    };
    const { handler, session, world } = makeHarness(store, {
      mapItems: [{ position: { x: 1, y: 2, z: 7 }, item: water }],
    });
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(
      session,
      {
        type: "drop-item",
        itemId: ITEM_ID,
        revision: 1,
        position: { x: 1, y: 2, z: 7 },
      },
      0,
    );

    // Destroyed, not placed: gone from the inventory and never on the tile.
    expect(
      handler
        .inventorySnapshot(CHARACTER_ID)
        ?.items.find((item) => item.id === ITEM_ID),
    ).toBeUndefined();
    expect(world.getMapItems({ x: 1, y: 2, z: 7 })).toEqual([water]);

    // Durable delete once the persist queue drains.
    const durable = await handler.load(CHARACTER_ID, 400);
    expect(durable.items.find((item) => item.id === ITEM_ID)).toBeUndefined();
  });

  it("reads and atomically writes bounded owned item text", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    store.seed({
      id: LETTER_ID,
      typeId: 3505,
      count: 1,
      attributes: { text: "Before" },
      version: 1,
      location: {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 2,
      },
    });
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "use-item",
      itemId: LETTER_ID,
      revision: 1,
    });
    expect(sent.at(-1)).toMatchObject({
      type: "item-text",
      itemId: LETTER_ID,
      text: "Before",
      writeable: true,
    });

    handler.handle(session, {
      type: "write-item",
      itemId: LETTER_ID,
      revision: 1,
      text: "After",
    });
    await handler.load(CHARACTER_ID, 400);
    handler.applyResolvedOutcomes(1_000);
    handler.handle(session, {
      type: "use-item",
      itemId: LETTER_ID,
      revision: 2,
    });

    expect(sent.at(-1)).toMatchObject({
      type: "item-text",
      itemId: LETTER_ID,
      revision: 2,
      text: "After",
    });
  });

  it("echoes a drag intent's nonce in its inventory-updated confirmation", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "move-item",
      itemId: ITEM_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 1,
      nonce: "n42",
    });
    expect(sent.at(-1)).toMatchObject({ type: "inventory-updated", nonce: "n42" });

    // A move without a nonce carries none (so the client patches, not advances).
    handler.handle(session, {
      type: "move-item",
      itemId: ITEM_ID,
      revision: 2,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 2,
    });
    const last = sent.at(-1);
    expect(last).toMatchObject({ type: "inventory-updated" });
    expect(last && "nonce" in last ? last.nonce : undefined).toBeUndefined();
  });

  it("applies a move in the same tick and persists it across detach", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "move-item",
      itemId: ITEM_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 1,
    });

    expect(sent.at(-1)).toMatchObject({ type: "inventory-updated" });
    handler.detach(CHARACTER_ID);
    session.playerId = null;
    // load() drains the persist queue, so the write must be durable by now.
    const durable = await handler.load(CHARACTER_ID, 400);
    handler.applyResolvedOutcomes(1_000);
    expect(durable.items).toContainEqual(
      expect.objectContaining({
        id: ITEM_ID,
        version: 2,
        location: expect.objectContaining({
          kind: "container",
          containerId: BACKPACK_ID,
        }),
      }),
    );
  });

  it("consumes food before applying bounded regeneration and rejects fullness", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    store.seed({
      id: FOOD_ID,
      typeId: 3577,
      count: 2,
      attributes: {},
      version: 1,
      location: {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 2,
      },
    });
    const { handler, player, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(
      session,
      {
        type: "use-item",
        itemId: FOOD_ID,
        revision: 1,
      },
      0,
    );
    expect(player.conditions.remainingMs("regeneration", 0)).toBe(180_000);
    expect(
      handler
        .inventorySnapshot(CHARACTER_ID)
        ?.items.find((item) => item.id === FOOD_ID),
    ).toMatchObject({ count: 1, version: 2 });
    handler.handle(
      session,
      {
        type: "use-item",
        itemId: FOOD_ID,
        revision: 1,
      },
      0,
    );
    expect(sent.at(-1)).toEqual({
      type: "error",
      code: "item-action-failed",
    });
    await handler.load(CHARACTER_ID, 400);
    handler.applyResolvedOutcomes(100);

    expect(player.conditions.remainingMs("regeneration", 100)).toBe(179_900);
    expect(sent).toContainEqual({
      type: "combat-log",
      kind: "condition",
      text: "Munch.",
    });
    expect(await store.loadForCharacter(CHARACTER_ID)).toContainEqual(
      expect.objectContaining({ id: FOOD_ID, count: 1, version: 2 }),
    );

    player.conditions.apply(
      {
        type: "regeneration",
        sourceId: player.id,
        durationMs: 1_100_000,
      },
      100,
    );
    handler.handle(
      session,
      {
        type: "use-item",
        itemId: FOOD_ID,
        revision: 2,
      },
      100,
    );

    expect(sent.at(-1)).toEqual({ type: "error", code: "player-full" });
    expect(await store.loadForCharacter(CHARACTER_ID)).toContainEqual(
      expect.objectContaining({ id: FOOD_ID, count: 1, version: 2 }),
    );
  });
});

function nestedItems(): Item[] {
  return [
    {
      id: BACKPACK_ID,
      typeId: 2854,
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
      id: POUCH_ID,
      typeId: 2853,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 0,
      },
    },
    {
      id: ITEM_ID,
      typeId: 3273,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "container",
        containerId: POUCH_ID,
        slot: 0,
      },
    },
  ];
}

interface HarnessOptions {
  readonly width?: number;
  readonly height?: number;
  readonly blocked?: ReadonlyArray<readonly [number, number]>;
  readonly playerPosition?: Position;
  readonly viewRange?: ViewRange;
  readonly mapItems?: ReadonlyArray<{ position: Position; item: MapItem }>;
}

function makeHarness(
  store: MemoryItemStore,
  options: HarnessOptions = {},
): {
  handler: ItemIntentHandler;
  player: Player;
  session: Session;
  sent: ServerMessage[];
  world: World;
} {
  const world = new World(
    gridMapData({
      name: "test",
      width: options.width ?? 3,
      height: options.height ?? 3,
      blocked: options.blocked ?? [],
      items: options.mapItems,
    }),
    25,
  );
  const player = new Player(
    makeCharacter(CHARACTER_ID, "Container Tester"),
    options.playerPosition ?? { x: 1, y: 1, z: 7 },
  );
  world.addPlayer(player);
  const sent: ServerMessage[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    on: vi.fn(),
    send: vi.fn((value: string) => {
      sent.push(JSON.parse(value) as ServerMessage);
    }),
  } as unknown as WebSocket;
  const session = new Session("session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: options.viewRange ?? { x: 9, y: 7 },
  });
  session.playerId = CHARACTER_ID;
  return {
    handler: new ItemIntentHandler(
      store,
      catalog,
      world,
      new Visibility(world, new SessionRegistry()),
    ),
    player,
    session,
    sent,
    world,
  };
}
