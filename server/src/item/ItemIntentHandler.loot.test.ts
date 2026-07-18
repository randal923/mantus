import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { Player } from "../Player";
import { Session } from "../Session";
import { gridMapData } from "../gridMapData";
import { SessionRegistry } from "../SessionRegistry";
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
/** Dead chicken: container corpse whose first decay clears loot protection. */
const CORPSE_TYPE = 6042;
const GOLD_TYPE = 3031;
const BACKPACK_TYPE = 2854;
const CORPSE_POSITION = { x: 1, y: 2, z: 7 };

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

interface Harness {
  readonly world: World;
  readonly store: MemoryItemStore;
  readonly items: ItemIntentHandler;
  readonly killer: { session: Session; sent: ServerMessage[]; player: Player };
  readonly rival: { session: Session; sent: ServerMessage[]; player: Player };
}

function makeSession(characterId: string): {
  session: Session;
  sent: ServerMessage[];
} {
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

async function makeHarness(input: {
  killerId: string | null;
  lootCount?: number;
}): Promise<Harness> {
  const world = new World(
    gridMapData({ name: "loot-test", width: 12, height: 12, blocked: [] }),
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
  const items = new ItemIntentHandler(
    store,
    catalog,
    world,
    visibility,
    new DecayManager(catalog),
  );
  const killerPlayer = new Player(makeCharacter(KILLER_ID, "Killer"), {
    x: 1,
    y: 1,
    z: 7,
  });
  const rivalPlayer = new Player(makeCharacter(RIVAL_ID, "Rival"), {
    x: 2,
    y: 2,
    z: 7,
  });
  world.addPlayer(killerPlayer);
  world.addPlayer(rivalPlayer);
  items.attach(await items.load(KILLER_ID, 400));
  items.attach(await items.load(RIVAL_ID, 400));
  items.createCorpse(
    input.killerId,
    "death:test-1",
    CORPSE_POSITION,
    0,
    CORPSE_TYPE,
    [{ typeId: GOLD_TYPE, count: input.lootCount ?? 10 }],
  );
  await settle(items, 0);
  const killer = makeSession(KILLER_ID);
  const rival = makeSession(RIVAL_ID);
  return {
    world,
    store,
    items,
    killer: { ...killer, player: killerPlayer },
    rival: { ...rival, player: rivalPlayer },
  };
}

async function settle(items: ItemIntentHandler, now: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  items.applyResolvedOutcomes(now);
}

function corpseAt(world: World) {
  const [mapItem] = world.getMapItems(CORPSE_POSITION);
  const corpse = mapItem ? world.getWorldItem(mapItem.instanceId) : undefined;
  if (!corpse) throw new Error("corpse is missing");
  return corpse;
}

function corpseChildren(world: World, corpseId: string) {
  return world.getWorldSubtree(corpseId).slice(1);
}

describe("world container (corpse) looting", () => {
  it("opens an adjacent corpse and loots into the backpack", async () => {
    const harness = await makeHarness({ killerId: KILLER_ID });
    const corpse = corpseAt(harness.world);
    const [gold] = corpseChildren(harness.world, corpse.id);

    expect(
      harness.items.handleMapOpen(harness.killer.session, CORPSE_POSITION),
    ).toBe(true);
    const opened = harness.killer.sent.at(-1);
    expect(opened).toMatchObject({
      type: "world-container-state",
      position: CORPSE_POSITION,
      state: {
        container: { id: corpse.id },
        items: [{ slot: 0, item: { id: gold.id, count: 10 } }],
      },
    });

    harness.items.handle(harness.killer.session, {
      type: "loot-item",
      itemId: gold.id,
      revision: 1,
      containerId: corpse.id,
    });
    expect(
      harness.killer.sent.some(
        (message) => message.type === "error",
      ),
    ).toBe(false);
    expect(
      harness.killer.sent.at(-1),
    ).toMatchObject({ type: "inventory-updated", inventory: { gold: 10 } });
    expect(corpseChildren(harness.world, corpse.id)).toEqual([]);

    // The viewer reconciliation pushes the now-empty container state.
    harness.items.tickWorldContainers();
    expect(harness.killer.sent.at(-1)).toMatchObject({
      type: "world-container-state",
      state: { container: { id: corpse.id }, items: [] },
    });

    // The row landed in the killer's backpack in the store.
    await harness.items.stopPersists();
    const persisted = await harness.store.loadForCharacter(KILLER_ID);
    expect(persisted).toContainEqual(
      expect.objectContaining({
        id: gold.id,
        count: 10,
        location: expect.objectContaining({
          kind: "container",
          containerId: KILLER_BACKPACK_ID,
        }),
      }),
    );
  });

  it("blocks non-owners from opening or looting until protection expires", async () => {
    const harness = await makeHarness({ killerId: KILLER_ID });
    const corpse = corpseAt(harness.world);
    const [gold] = corpseChildren(harness.world, corpse.id);

    expect(
      harness.items.handleMapOpen(harness.rival.session, CORPSE_POSITION),
    ).toBe(true);
    expect(harness.rival.sent.at(-1)).toMatchObject({
      type: "error",
      code: "loot-protected",
    });

    // A forged loot intent without an open view is rejected the same way.
    harness.items.handle(harness.rival.session, {
      type: "loot-item",
      itemId: gold.id,
      revision: 1,
      containerId: corpse.id,
    });
    expect(harness.rival.sent.at(-1)).toMatchObject({
      type: "error",
      code: "loot-protected",
    });
    expect(corpseChildren(harness.world, corpse.id)).toHaveLength(1);

    // First decay transform clears the owner attribute; the rival may loot.
    harness.items.tickDecay(10_000);
    await settle(harness.items, 10_000);
    expect(
      harness.items.handleMapOpen(harness.rival.session, CORPSE_POSITION),
    ).toBe(true);
    const reopened = harness.rival.sent.at(-1);
    expect(reopened).toMatchObject({ type: "world-container-state" });
  });

  it("leaves exactly one item when two players race for the same loot", async () => {
    const harness = await makeHarness({ killerId: null });
    const corpse = corpseAt(harness.world);
    const [gold] = corpseChildren(harness.world, corpse.id);

    harness.items.handleMapOpen(harness.killer.session, CORPSE_POSITION);
    harness.items.handleMapOpen(harness.rival.session, CORPSE_POSITION);
    const intent = {
      type: "loot-item",
      itemId: gold.id,
      revision: 1,
      containerId: corpse.id,
    } as const;
    harness.items.handle(harness.killer.session, intent);
    harness.items.handle(harness.rival.session, intent);

    expect(
      harness.killer.sent.some(
        (message) => message.type === "error",
      ),
    ).toBe(false);
    expect(harness.rival.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(corpseChildren(harness.world, corpse.id)).toEqual([]);

    await harness.items.stopPersists();
    const survivors = [
      ...(await harness.store.loadForCharacter(KILLER_ID)),
      ...(await harness.store.loadForCharacter(RIVAL_ID)),
    ].filter((item) => item.id === gold.id);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.location).toMatchObject({
      kind: "container",
      containerId: KILLER_BACKPACK_ID,
    });
  });

  it("rejects opening and looting out of reach, and closes on walk-away", async () => {
    const harness = await makeHarness({ killerId: KILLER_ID });
    const corpse = corpseAt(harness.world);
    const [gold] = corpseChildren(harness.world, corpse.id);

    // Out of reach: the tile is handled but only an error is sent.
    harness.killer.player.moveTo({ x: 6, y: 6, z: 7 });
    expect(
      harness.items.handleMapOpen(harness.killer.session, CORPSE_POSITION),
    ).toBe(true);
    expect(harness.killer.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });

    // Open while adjacent, then walk away: loot is re-validated at execution.
    harness.killer.player.moveTo({ x: 1, y: 1, z: 7 });
    harness.items.handleMapOpen(harness.killer.session, CORPSE_POSITION);
    harness.killer.player.moveTo({ x: 6, y: 6, z: 7 });
    harness.items.handle(harness.killer.session, {
      type: "loot-item",
      itemId: gold.id,
      revision: 1,
      containerId: corpse.id,
    });
    expect(harness.killer.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(corpseChildren(harness.world, corpse.id)).toHaveLength(1);

    // The per-tick reconciliation closes the abandoned view.
    harness.items.tickWorldContainers();
    expect(harness.killer.sent.at(-1)).toMatchObject({
      type: "world-container-closed",
      containerId: corpse.id,
    });
  });

  it("rejects stale-revision loot replays", async () => {
    const harness = await makeHarness({ killerId: KILLER_ID });
    const corpse = corpseAt(harness.world);
    const [gold] = corpseChildren(harness.world, corpse.id);
    harness.items.handleMapOpen(harness.killer.session, CORPSE_POSITION);

    harness.items.handle(harness.killer.session, {
      type: "loot-item",
      itemId: gold.id,
      revision: 99,
      containerId: corpse.id,
    });
    expect(harness.killer.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(corpseChildren(harness.world, corpse.id)).toHaveLength(1);
  });
});

