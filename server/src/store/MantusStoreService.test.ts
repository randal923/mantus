import { describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { MantusStoreService } from "./MantusStoreService";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { MantusStoreStore } from "./MantusStoreStore";
import type { StoreLiveHooks } from "./StoreLiveHooks";

const CHARACTER_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";

const storeWith = (
  purchase: MantusStoreStore["purchase"],
): MantusStoreStore => ({
  purchase,
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
    wildcardsOf: () => 0,
    applyWildcardBalance: vi.fn(),
    preySlotsUnlocked: () => false,
    huntingSlotsUnlocked: () => false,
    applyPreySlotUnlock: vi.fn(),
    applyHuntingSlotUnlock: vi.fn(),
    xpBoostUntilMs: () => 0,
    applyXpBoost: vi.fn(),
    injectDelivery: vi.fn(),
    applySexChange: vi.fn(),
    canTempleTeleport: () => true,
    templeTeleport: vi.fn(),
    ...overrides,
  };
}

/** Only `require().spriteId` is reached when projecting an item icon. */
const itemCatalog = {
  require: (itemTypeId: number) => ({ spriteId: itemTypeId }),
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

  it("refuses a temple teleport in combat without charging", () => {
    const { world } = makeWorld();
    const sent: ServerMessage[] = [];
    const session = makeSession(sent);
    const purchase = vi.fn<MantusStoreStore["purchase"]>();
    const service = new MantusStoreService(
      world,
      registryFor(session),
      itemCatalog,
      storeWith(purchase),
      hooksWith({ canTempleTeleport: () => false }),
    );

    service.handle(
      session,
      { type: "store-purchase", offerId: "temple-teleport" },
      0,
    );

    expect(purchase).not.toHaveBeenCalled();
    expect(sent).toEqual([{ type: "store-action-failed", reason: "in-combat" }]);
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
    expect(owned?.disabledReason).toMatch(/already own this mount/i);
  });

  it("serves a product description only when asked", () => {
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
    // Descriptions are absent from list pages; 140 of them would not fit.
    expect(offers.products[0]).not.toHaveProperty("description");

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
});
