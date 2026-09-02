import { describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { MantusStoreService } from "./MantusStoreService";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { MantusStoreStore } from "./MantusStoreStore";
import { STORE_OFFERS_BY_ID } from "./storeCatalog";
import type { StoreLiveHooks } from "./StoreLiveHooks";

const CHARACTER_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";

const storeWith = (
  purchase: MantusStoreStore["purchase"],
  persistPurchase: MantusStoreStore["persistPurchase"] = vi.fn(
    async () => undefined,
  ),
): MantusStoreStore => ({
  purchase,
  persistPurchase,
  grant: vi.fn(),
  refund: vi.fn(),
  history: vi.fn(async () => []),
  facts: vi.fn(async () => ({
    ownedUniqueItemTypeIds: [],
    xpBoostPurchasesToday: 0,
  })),
});

function hooksWith(overrides: Partial<StoreLiveHooks> = {}): StoreLiveHooks {
  return {
    entitlementsFor: () => ({ outfits: [], mounts: [] }),
    refreshOutfits: vi.fn(),
    applyOutfitGrant: vi.fn(),
    applyMountGrant: vi.fn(),
    wildcardsOf: () => 0,
    applyWildcardBalance: vi.fn(),
    preySlotsUnlocked: () => false,
    huntingSlotsUnlocked: () => false,
    nextLockedPreySlot: () => 1,
    nextLockedHuntingSlot: () => 1,
    applyPreySlotUnlock: vi.fn(),
    applyHuntingSlotUnlock: vi.fn(),
    xpBoostUntilMs: () => 0,
    applyXpBoost: vi.fn(),
    injectDelivery: vi.fn(),
    applySexChange: vi.fn(),
    ...overrides,
  };
}

/** Icon projection reads sprite ids; delivery planning reads item physics. */
const itemCatalog = {
  require: (itemTypeId: number) => ({
    spriteId: itemTypeId,
    clientId: itemTypeId,
    name: `item-${itemTypeId}`,
    pickupable: true,
    maxCount: 100,
    containerCapacity: 30,
  }),
} as unknown as ItemCatalog;

function makeWorld(): { world: World; player: Player } {
  const world = new World(
    gridMapData({
      name: "store-test",
      width: 20,
      height: 20,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const player = new Player(
    makeCharacter(CHARACTER_ID, "Store Hero"),
    { x: 10, y: 10, z: 7 },
    0,
  );
  world.addPlayer(player);
  return { world, player };
}

function makeSession(sent: ServerMessage[], mantusCoins = 5_000): Session {
  return {
    id: "store-session",
    playerId: CHARACTER_ID,
    storeOperationPending: false,
    account: {
      id: ACCOUNT_ID,
      supabaseUserId: "store-user",
      email: null,
      bannedUntil: null,
      premiumUntil: null,
      mantusCoins,
      language: "en",
      uiSettings: {},
    },
    send: (message: ServerMessage) => sent.push(message),
    sendError: vi.fn(),
  } as unknown as Session;
}

function registryFor(session: Session): SessionRegistry {
  return {
    sessionFor: (characterId: string) =>
      characterId === CHARACTER_ID ? session : undefined,
  } as unknown as SessionRegistry;
}

/** A live-cache stand-in: captures mutations and queued persist thunks. */
function fakeItems(items: ReadonlyArray<Item> = []): {
  handler: ItemIntentHandler;
  persists: Array<() => Promise<void>>;
  mutations: unknown[];
} {
  const persists: Array<() => Promise<void>> = [];
  const mutations: unknown[] = [];
  const handler = {
    inventorySnapshot: () => ({ items, capacityMax: 1_000, bankBalance: 0 }),
    applyCommittedMutation: (
      _session: unknown,
      _characterId: unknown,
      mutation: unknown,
    ) => {
      mutations.push(mutation);
    },
    enqueuePersist: (
      _session: unknown,
      _characterId: unknown,
      persist: () => Promise<void>,
    ) => {
      persists.push(persist);
    },
  } as unknown as ItemIntentHandler;
  return { handler, persists, mutations };
}

/** Opens the store and settles the facts load, arming the memory-first path. */
async function openStore(
  service: MantusStoreService,
  session: Session,
): Promise<void> {
  service.handle(session, { type: "store-open" }, 0);
  await service.stop();
  service.applyResolvedOutcomes(0);
}

function stackableOffer(): {
  offerId: string;
  price: number;
  count: number;
} {
  const entry = [...STORE_OFFERS_BY_ID.values()].find(
    ({ offer }) =>
      offer.grant.kind === "stackable" &&
      !offer.grant.unique &&
      offer.grant.count > 100,
  );
  if (!entry || entry.offer.grant.kind !== "stackable") {
    throw new Error("expected a multi-stack stackable offer in the catalog");
  }
  return {
    offerId: entry.offer.id,
    price: entry.offer.price,
    count: entry.offer.grant.count,
  };
}

describe("MantusStoreService", () => {
  it("serves the category tree and pages a category", () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(vi.fn()),
      hooksWith(),
    );

    service.handle(session, { type: "store-open" }, 0);
    const state = sent.at(-1);
    expect(state).toMatchObject({ type: "store-state", balance: 5_000 });
    if (state?.type !== "store-state") throw new Error("expected store-state");
    // Parent categories first, then their children pointing back at them.
    expect(state.categories.some((entry) => entry.id === "cosmetics")).toBe(true);
    expect(
      state.categories.find((entry) => entry.id === "mounts")?.parentId,
    ).toBe("cosmetics");
    expect(state.home.length).toBeGreaterThan(0);

    service.handle(session, { type: "store-category", categoryId: "mounts", page: 0 }, 0);
    const offers = sent.at(-1);
    expect(offers).toMatchObject({ type: "store-offers", categoryId: "mounts", page: 0 });
    if (offers?.type !== "store-offers") throw new Error("expected store-offers");
    // The mount catalog is far larger than one page, so it must be paged.
    expect(offers.pageCount).toBeGreaterThan(1);
    expect(offers.products.length).toBeLessThanOrEqual(12);
  });

  it("groups premium durations as one product with priced sub-offers", () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(vi.fn()),
      hooksWith(),
    );

    service.handle(
      session,
      { type: "store-category", categoryId: "premium-time", page: 0 },
      0,
    );
    const offers = sent.at(-1);
    if (offers?.type !== "store-offers") throw new Error("expected store-offers");
    const premium = offers.products[0];
    expect(premium?.kind).toBe("premium");
    expect(premium?.subOffers.map((offer) => offer.id)).toEqual([
      "premium-30",
      "premium-90",
      "premium-180",
      "premium-360",
    ]);
    expect(premium?.subOffers[0]?.price).toBe(250);
  });

  it("passes only an offer id to storage and applies the committed balance", async () => {
    const { world, player } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const purchase = vi.fn<MantusStoreStore["purchase"]>().mockResolvedValue({
      status: "committed",
      balance: 4_750,
      premiumUntil: new Date(30 * 24 * 60 * 60 * 1_000),
      price: 250,
      effect: { kind: "premium" },
      deliveredItems: [],
    });
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(purchase),
      hooksWith(),
    );

    service.handle(session, { type: "store-purchase", offerId: "premium-30" }, 0);
    await service.stop();
    service.applyResolvedOutcomes(0);

    // No price, no product, no count — the catalog is the server's.
    expect(purchase).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      characterId: CHARACTER_ID,
      offerId: "premium-30",
      requestId: expect.any(String),
    });
    expect(session.account?.mantusCoins).toBe(4_750);
    expect(player.accountTierAt(0)).toBe("premium");
    expect(sent.at(-1)).toEqual({
      type: "store-purchase-completed",
      offerId: "premium-30",
      balance: 4_750,
      accountTier: "premium",
      premiumDaysRemaining: 30,
    });
  });

  it("rejects unknown offer ids before calling storage", () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const purchase = vi.fn<MantusStoreStore["purchase"]>();
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(purchase),
      hooksWith(),
    );

    service.handle(
      session,
      { type: "store-purchase", offerId: "client-priced-offer" },
      0,
    );

    expect(purchase).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { type: "store-action-failed", reason: "offer-not-found" },
    ]);
  });

  it("refuses a name on a product that is not a name change", () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const purchase = vi.fn<MantusStoreStore["purchase"]>();
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(purchase),
      hooksWith(),
    );

    service.handle(
      session,
      { type: "store-purchase", offerId: "premium-30", newName: "Someone Else" },
      0,
    );

    expect(purchase).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { type: "store-action-failed", reason: "offer-not-found" },
    ]);
  });

  it("requires a name for a name-change purchase", () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const purchase = vi.fn<MantusStoreStore["purchase"]>();
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(purchase),
      hooksWith(),
    );

    service.handle(session, { type: "store-purchase", offerId: "name-change" }, 0);

    expect(purchase).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { type: "store-action-failed", reason: "name-required" },
    ]);
  });

  it("greys out a mount the character already owns", () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(vi.fn()),
      hooksWith({
        entitlementsFor: () => ({ outfits: [], mounts: [{ mountId: 23 }] }),
      }),
    );

    service.handle(
      session,
      { type: "store-category", categoryId: "mounts", page: 0 },
      0,
    );
    const offers = sent.at(-1);
    if (offers?.type !== "store-offers") throw new Error("expected store-offers");
    const owned = offers.products
      .flatMap((product) => product.subOffers)
      .find((offer) => offer.id === "mount-23");
    expect(owned?.disabled).toBe(true);
    expect(owned?.disabledReason).toBe("mount-owned");
  });

  it("lists products with their description and serves it on request too", () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(vi.fn()),
      hooksWith(),
    );

    service.handle(
      session,
      { type: "store-category", categoryId: "premium-time", page: 0 },
      0,
    );
    const offers = sent.at(-1);
    if (offers?.type !== "store-offers") throw new Error("expected store-offers");
    // The shelf shows the full text; every page is measured against the
    // message cap at boot (assertStoreCatalog).
    expect(offers.products[0]?.description).toContain("VIP");

    service.handle(
      session,
      { type: "store-description", productId: "premium-time" },
      0,
    );
    const description = sent.at(-1);
    expect(description).toMatchObject({
      type: "store-description-state",
      productId: "premium-time",
    });
    if (description?.type !== "store-description-state") return;
    expect(description.description.length).toBeGreaterThan(0);
  });

  it("answers a stackable purchase from memory and queues one persist", async () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent, 100_000);
    const purchase = vi.fn<MantusStoreStore["purchase"]>();
    const persistPurchase = vi
      .fn<MantusStoreStore["persistPurchase"]>()
      .mockResolvedValue(undefined);
    const { handler, persists, mutations } = fakeItems();
    const injected: Item[] = [];
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(purchase, persistPurchase),
      hooksWith({
        injectDelivery: (_characterId, item) => {
          injected.push(item);
        },
      }),
      handler,
    );
    await openStore(service, session);
    const offer = stackableOffer();

    service.handle(
      session,
      { type: "store-purchase", offerId: offer.offerId },
      1_000,
    );

    // Answered in the tick: storage was never asked to decide anything.
    expect(purchase).not.toHaveBeenCalled();
    expect(sent.at(-1)).toMatchObject({
      type: "store-purchase-completed",
      offerId: offer.offerId,
      balance: 100_000 - offer.price,
      deliveredToBound: true,
    });
    expect(session.account?.mantusCoins).toBe(100_000 - offer.price);
    // The missing bound root was created in the carried inventory first.
    expect(mutations).toHaveLength(1);
    // One stack per maxCount, injected into the live caches.
    expect(injected).toHaveLength(Math.ceil(offer.count / 100));
    // Exactly one durable leg, queued on the persist lane with pinned rows.
    expect(persists).toHaveLength(1);
    await persists[0]!();
    expect(persistPurchase).toHaveBeenCalledTimes(1);
    const plan = persistPurchase.mock.calls[0]![0];
    expect(plan).toMatchObject({
      accountId: ACCOUNT_ID,
      characterId: CHARACTER_ID,
      offerId: offer.offerId,
      price: offer.price,
    });
    expect(plan.boundDelivery?.createBoundRoot).toBe(true);
    expect(plan.boundDelivery?.rows.map((row) => row.id)).toEqual(
      injected.map((item) => item.id),
    );
  });

  it("refuses in the tick once the balance is spent", async () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const offer = stackableOffer();
    const session = makeSession(sent, offer.price);
    const persistPurchase = vi
      .fn<MantusStoreStore["persistPurchase"]>()
      .mockResolvedValue(undefined);
    const { handler, persists } = fakeItems();
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(vi.fn(), persistPurchase),
      hooksWith(),
      handler,
    );
    await openStore(service, session);

    service.handle(
      session,
      { type: "store-purchase", offerId: offer.offerId },
      1_000,
    );
    expect(session.account?.mantusCoins).toBe(0);
    service.handle(
      session,
      { type: "store-purchase", offerId: offer.offerId },
      2_000,
    );

    expect(sent.at(-1)).toEqual({
      type: "store-action-failed",
      reason: "insufficient-coins",
    });
    expect(persists).toHaveLength(1);
  });

  it("falls back to the database purchase before facts are loaded", async () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const purchase = vi.fn<MantusStoreStore["purchase"]>().mockResolvedValue({
      status: "committed",
      balance: 4_750,
      premiumUntil: null,
      price: 250,
      effect: null,
      deliveredItems: [],
    });
    const persistPurchase = vi
      .fn<MantusStoreStore["persistPurchase"]>()
      .mockResolvedValue(undefined);
    const { handler, persists } = fakeItems();
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(purchase, persistPurchase),
      hooksWith(),
      handler,
    );

    // No store-open first: the facts cache is empty.
    service.handle(
      session,
      { type: "store-purchase", offerId: "premium-30" },
      0,
    );
    await service.stop();
    service.applyResolvedOutcomes(0);

    expect(purchase).toHaveBeenCalledTimes(1);
    expect(persists).toHaveLength(0);
    expect(session.account?.mantusCoins).toBe(4_750);
  });

  it("applies a mount purchase to live entitlements in the tick", async () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent, 100_000);
    const persistPurchase = vi
      .fn<MantusStoreStore["persistPurchase"]>()
      .mockResolvedValue(undefined);
    const { handler, persists } = fakeItems();
    const applyMountGrant = vi.fn();
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(vi.fn(), persistPurchase),
      hooksWith({ applyMountGrant }),
      handler,
    );
    await openStore(service, session);

    service.handle(
      session,
      { type: "store-purchase", offerId: "mount-23" },
      1_000,
    );

    expect(applyMountGrant).toHaveBeenCalledWith(CHARACTER_ID, 23);
    expect(sent.at(-1)).toMatchObject({
      type: "store-purchase-completed",
      offerId: "mount-23",
    });
    expect(persists).toHaveLength(1);
    await persists[0]!();
    expect(persistPurchase.mock.calls[0]![0]).toMatchObject({
      offerId: "mount-23",
      premiumUntil: null,
    });
  });
});
