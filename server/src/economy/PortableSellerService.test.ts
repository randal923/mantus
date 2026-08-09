import {
  PORTABLE_SELLER_AUTO_INTERVAL_MS,
  PORTABLE_SELLER_MANUAL_COOLDOWN_MS,
  PORTABLE_SELLER_TYPE_ID,
} from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "../item/Item";
import { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemType } from "../item/ItemType";
import { ITEM_POUCH_TYPE_ID } from "../item/itemPouchTypeId";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { PortableSellerService } from "./PortableSellerService";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOUND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POUCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SELLER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LOOT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

const LOOT_TYPE = 12;

const catalog = new ItemCatalog([
  makeItemType({ id: 23_396, containerCapacity: 20, movable: false }),
  makeItemType({
    id: ITEM_POUCH_TYPE_ID,
    containerCapacity: 500,
    movable: false,
  }),
  makeItemType({ id: PORTABLE_SELLER_TYPE_ID, movable: false }),
  makeItemType({ id: LOOT_TYPE, npcValue: 40 }),
]);

const itemsWithLoot = (loot: boolean): Item[] => [
  {
    id: BOUND_ID,
    typeId: 23_396,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId: CHARACTER_ID, slot: "bound" },
  },
  {
    id: POUCH_ID,
    typeId: ITEM_POUCH_TYPE_ID,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: BOUND_ID, slot: 0 },
  },
  {
    id: SELLER_ID,
    typeId: PORTABLE_SELLER_TYPE_ID,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: BOUND_ID, slot: 1 },
  },
  ...(loot
    ? [
        {
          id: LOOT_ID,
          typeId: LOOT_TYPE,
          count: 1,
          attributes: {},
          version: 1,
          location: {
            kind: "container" as const,
            containerId: POUCH_ID,
            slot: 0,
          },
        },
      ]
    : []),
];

const harness = (initialItems: Item[]) => {
  let items = initialItems;
  const session = {
    playerId: CHARACTER_ID,
    itemOperationPending: false,
    travelOperationPending: false,
    send: vi.fn(),
    sendError: vi.fn(),
  };
  const itemsHandler = {
    inventorySnapshot: () => ({
      characterId: CHARACTER_ID,
      capacityMax: 400,
      items,
      revision: 1,
      openContainerIds: new Set<string>(),
      bankBalance: 100,
    }),
    applyCommittedMutation: vi.fn(
      (_session: unknown, _characterId: string, mutation: { removedItemIds?: readonly string[] }) => {
        const removed = new Set(mutation.removedItemIds ?? []);
        items = items.filter((item) => !removed.has(item.id));
      },
    ),
    setBankBalance: vi.fn(),
    enqueuePersist: vi.fn(),
  };
  const registry = { all: () => [session] };
  const service = new PortableSellerService(
    registry as unknown as SessionRegistry,
    itemsHandler as unknown as ItemIntentHandler,
    catalog,
  );
  return { service, session, itemsHandler, setItems: (next: Item[]) => (items = next) };
};

const saleMessageOf = (session: { send: ReturnType<typeof vi.fn> }) =>
  session.send.mock.calls
    .map(([message]) => message)
    .find((message) => message.type === "portable-seller-triggered");

describe("PortableSellerService", () => {
  it("auto-sells only after the full interval", () => {
    const { service, session } = harness(itemsWithLoot(true));
    const start = 1_000_000;

    service.tick(start);
    service.tick(start + PORTABLE_SELLER_AUTO_INTERVAL_MS - 1);
    expect(saleMessageOf(session)).toBeUndefined();

    service.tick(start + PORTABLE_SELLER_AUTO_INTERVAL_MS);
    const sale = saleMessageOf(session);
    expect(sale).toMatchObject({
      itemId: SELLER_ID,
      soldCount: 1,
      proceeds: 40,
      bankBalance: 140,
    });
  });

  it("does nothing on the interval without a carried seller", () => {
    const { service, session } = harness(
      itemsWithLoot(true).filter((item) => item.id !== SELLER_ID),
    );
    const start = 1_000_000;
    service.tick(start);
    service.tick(start + PORTABLE_SELLER_AUTO_INTERVAL_MS);
    expect(saleMessageOf(session)).toBeUndefined();
  });

  it("enforces the manual cooldown server-side", () => {
    const { service, session, setItems } = harness(itemsWithLoot(true));
    const start = 2_000_000;
    const intent = {
      type: "use-item" as const,
      itemId: SELLER_ID,
      revision: 1,
    };

    expect(service.handleUseItem(session as unknown as Session, intent, start)).toBe(true);
    expect(saleMessageOf(session)).toBeDefined();

    setItems(itemsWithLoot(true));
    expect(
      service.handleUseItem(session as unknown as Session, intent, start + 1_000),
    ).toBe(true);
    expect(
      session.send.mock.calls
        .map(([message]) => message)
        .find((message) => message.type === "portable-seller-cooldown"),
    ).toEqual({
      type: "portable-seller-cooldown",
      remainingMs: PORTABLE_SELLER_MANUAL_COOLDOWN_MS - 1_000,
    });
    expect(
      session.send.mock.calls.filter(
        ([message]) => message.type === "portable-seller-triggered",
      ),
    ).toHaveLength(1);

    expect(
      service.handleUseItem(
        session as unknown as Session,
        intent,
        start + PORTABLE_SELLER_MANUAL_COOLDOWN_MS,
      ),
    ).toBe(true);
    expect(
      session.send.mock.calls.filter(
        ([message]) => message.type === "portable-seller-triggered",
      ),
    ).toHaveLength(2);
  });

  it("reports an empty sweep without arming the cooldown", () => {
    const { service, session, setItems } = harness(itemsWithLoot(false));
    const start = 3_000_000;
    const intent = {
      type: "use-item" as const,
      itemId: SELLER_ID,
      revision: 1,
    };

    expect(service.handleUseItem(session as unknown as Session, intent, start)).toBe(true);
    expect(session.sendError).toHaveBeenCalledWith("portable-seller-empty");

    setItems(itemsWithLoot(true));
    expect(
      service.handleUseItem(session as unknown as Session, intent, start + 1_000),
    ).toBe(true);
    expect(saleMessageOf(session)).toBeDefined();
  });

  it("ignores use intents for other items and stale revisions", () => {
    const { service, session } = harness(itemsWithLoot(true));
    expect(
      service.handleUseItem(
        session as unknown as Session,
        { type: "use-item", itemId: LOOT_ID, revision: 1 },
        4_000_000,
      ),
    ).toBe(false);
    expect(
      service.handleUseItem(
        session as unknown as Session,
        { type: "use-item", itemId: SELLER_ID, revision: 99 },
        4_000_000,
      ),
    ).toBe(false);
  });

  it("retries shortly instead of skipping a full cycle when busy", () => {
    const { service, session } = harness(itemsWithLoot(true));
    const start = 5_000_000;
    service.tick(start);
    session.itemOperationPending = true;
    service.tick(start + PORTABLE_SELLER_AUTO_INTERVAL_MS);
    expect(saleMessageOf(session)).toBeUndefined();
    session.itemOperationPending = false;
    service.tick(start + PORTABLE_SELLER_AUTO_INTERVAL_MS + 5_000);
    expect(saleMessageOf(session)).toBeDefined();
  });
});
