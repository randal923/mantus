import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import type { SessionRegistry } from "../SessionRegistry";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { DecayManager } from "./DecayManager";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { loadItemCatalog } from "./loadItemCatalog";
import { MemoryItemStore } from "./MemoryItemStore";

const CHARACTER_ID = "8b1c9a10-1c4b-4f2a-9a2d-1d0f6b5f9c31";
const BACKPACK_ID = "5c0f6c7e-3f0f-4a52-b6a2-3d54f6c0a111";
const RING_ID = "2a3d4e5f-6071-4823-9945-aabbccddeeff";
const BACKPACK_TYPE = 2854;
/** Life ring: inert while carried, burns for 20 minutes once worn. */
const LIFE_RING_TYPE = 3052;
const LIFE_RING_ACTIVE_TYPE = 3089;
const LIFE_RING_DURATION_MS = 1_200_000;
/** Scarab cheese: decays in the backpack into an ordinary cheese. */
const SCARAB_CHEESE_TYPE = 169;
const CHEESE_TYPE = 3120;
const SCARAB_CHEESE_DURATION_MS = 1_800_000;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function makeSession(): { session: Session; sent: ServerMessage[] } {
  const sent: ServerMessage[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    on: vi.fn(),
    send: vi.fn((value: string) => {
      sent.push(JSON.parse(value) as ServerMessage);
    }),
  } as unknown as WebSocket;
  const session = new Session(CHARACTER_ID, "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = CHARACTER_ID;
  return { session, sent };
}

function ownedItem(
  id: string,
  typeId: number,
  location: Item["location"],
): Item {
  return { id, typeId, count: 1, attributes: {}, version: 1, location };
}

async function makeHarness(
  extraItems: ReadonlyArray<Item> = [],
  agesMs?: ReadonlyMap<string, number>,
) {
  const world = new World(
    gridMapData({ name: "carried-decay", width: 12, height: 12, blocked: [] }),
    25,
  );
  const registryStub = {
    all: () => [],
    sessionFor: () => undefined,
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registryStub);
  const store = new MemoryItemStore(catalog);
  const decay = new DecayManager(catalog);
  const { session, sent } = makeSession();
  world.addPlayer(
    new Player(makeCharacter(CHARACTER_ID, "Wearer"), { x: 1, y: 1, z: 7 }, 0),
  );
  const items = new ItemIntentHandler(
    store,
    catalog,
    world,
    visibility,
    decay,
    (characterId) => (characterId === CHARACTER_ID ? session : undefined),
  );
  store.seed(
    ownedItem(BACKPACK_ID, BACKPACK_TYPE, {
      kind: "equipment",
      characterId: CHARACTER_ID,
      slot: "backpack",
    }),
  );
  for (const item of extraItems) store.seed(item);
  const loaded = await items.load(CHARACTER_ID, 400);
  items.attach({ ...loaded, ...(agesMs ? { agesMs } : {}) }, 0);
  sent.length = 0;
  return { items, store, session, sent, decay };
}

async function settle(
  items: ItemIntentHandler,
  now: number,
): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  items.applyResolvedOutcomes(now);
}

function carried(store: MemoryItemStore, id: string): Item | undefined {
  return store.allItems().find((item) => item.id === id);
}

describe("carried and equipped item decay", () => {
  it("burns an equipped ring down and destroys it, leaving the row gone", async () => {
    const harness = await makeHarness([
      ownedItem(RING_ID, LIFE_RING_TYPE, {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 0,
      }),
    ]);

    // Inert in the backpack: no deadline, so nothing decays.
    harness.items.tickDecay(LIFE_RING_DURATION_MS * 2);
    await settle(harness.items, LIFE_RING_DURATION_MS * 2);
    expect(carried(harness.store, RING_ID)?.typeId).toBe(LIFE_RING_TYPE);

    harness.items.handle(
      harness.session,
      { type: "equip-item", itemId: RING_ID, revision: 1, slot: "ring" },
      1_000,
    );
    await settle(harness.items, 1_000);
    expect(carried(harness.store, RING_ID)?.typeId).toBe(
      LIFE_RING_ACTIVE_TYPE,
    );

    // Not yet due.
    harness.items.tickDecay(1_000 + LIFE_RING_DURATION_MS - 1);
    await settle(harness.items, 1_000 + LIFE_RING_DURATION_MS - 1);
    expect(carried(harness.store, RING_ID)).toBeDefined();

    harness.items.tickDecay(1_000 + LIFE_RING_DURATION_MS);
    await settle(harness.items, 1_000 + LIFE_RING_DURATION_MS);

    expect(carried(harness.store, RING_ID)).toBeUndefined();
    expect(harness.sent.at(-1)).toMatchObject({ type: "inventory-updated" });
  });

  it("stops the burn when the ring comes off and re-arms when it goes back on", async () => {
    const harness = await makeHarness([
      ownedItem(RING_ID, LIFE_RING_TYPE, {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 0,
      }),
    ]);
    harness.items.handle(
      harness.session,
      { type: "equip-item", itemId: RING_ID, revision: 1, slot: "ring" },
      0,
    );
    await settle(harness.items, 0);
    const equipped = carried(harness.store, RING_ID);
    if (!equipped) throw new Error("expected an equipped ring");

    harness.items.handle(
      harness.session,
      {
        type: "unequip-item",
        itemId: RING_ID,
        revision: equipped.version,
        slot: "ring",
      },
      1_000,
    );
    await settle(harness.items, 1_000);
    expect(carried(harness.store, RING_ID)?.typeId).toBe(LIFE_RING_TYPE);

    // Long past the original deadline: the de-equipped ring never expires.
    harness.items.tickDecay(LIFE_RING_DURATION_MS * 3);
    await settle(harness.items, LIFE_RING_DURATION_MS * 3);
    expect(carried(harness.store, RING_ID)?.typeId).toBe(LIFE_RING_TYPE);

    const unequipped = carried(harness.store, RING_ID);
    if (!unequipped) throw new Error("expected the ring back in the bag");
    harness.items.handle(
      harness.session,
      {
        type: "equip-item",
        itemId: RING_ID,
        revision: unequipped.version,
        slot: "ring",
      },
      LIFE_RING_DURATION_MS * 3,
    );
    await settle(harness.items, LIFE_RING_DURATION_MS * 3);

    // Re-arming starts a fresh full duration from the moment it went back on.
    harness.items.tickDecay(LIFE_RING_DURATION_MS * 4 - 1);
    await settle(harness.items, LIFE_RING_DURATION_MS * 4 - 1);
    expect(carried(harness.store, RING_ID)).toBeDefined();
    harness.items.tickDecay(LIFE_RING_DURATION_MS * 4);
    await settle(harness.items, LIFE_RING_DURATION_MS * 4);
    expect(carried(harness.store, RING_ID)).toBeUndefined();
  });

  it("transforms a decaying carried item into its target type", async () => {
    const harness = await makeHarness([
      ownedItem(RING_ID, SCARAB_CHEESE_TYPE, {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 0,
      }),
    ]);

    harness.items.tickDecay(SCARAB_CHEESE_DURATION_MS);
    await settle(harness.items, SCARAB_CHEESE_DURATION_MS);

    const transformed = carried(harness.store, RING_ID);
    expect(transformed?.typeId).toBe(CHEESE_TYPE);
    expect(transformed?.version).toBe(2);
  });

  it("resumes a carried deadline from the row age instead of restarting it", async () => {
    // Logged back in with 29 of the 30 minutes already burned.
    const harness = await makeHarness(
      [
        ownedItem(RING_ID, SCARAB_CHEESE_TYPE, {
          kind: "container",
          containerId: BACKPACK_ID,
          slot: 0,
        }),
      ],
      new Map([[RING_ID, SCARAB_CHEESE_DURATION_MS - 60_000]]),
    );

    harness.items.tickDecay(59_999);
    await settle(harness.items, 59_999);
    expect(carried(harness.store, RING_ID)?.typeId).toBe(SCARAB_CHEESE_TYPE);

    harness.items.tickDecay(60_000);
    await settle(harness.items, 60_000);
    expect(carried(harness.store, RING_ID)?.typeId).toBe(CHEESE_TYPE);
  });

  it("drops a character's carried deadlines when they leave the world", async () => {
    const harness = await makeHarness([
      ownedItem(RING_ID, SCARAB_CHEESE_TYPE, {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 0,
      }),
    ]);

    harness.items.detach(CHARACTER_ID);
    harness.items.tickDecay(SCARAB_CHEESE_DURATION_MS * 2);
    await settle(harness.items, SCARAB_CHEESE_DURATION_MS * 2);

    expect(carried(harness.store, RING_ID)?.typeId).toBe(SCARAB_CHEESE_TYPE);
  });
});
