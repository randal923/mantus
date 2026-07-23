import { describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { MantusStoreService } from "./MantusStoreService";
import type { MantusStoreStore } from "./MantusStoreStore";

const CHARACTER_ID = "00000000-0000-4000-8000-000000000001";

describe("MantusStoreService", () => {
  it("serves the server catalog and resolves price from the offer id", async () => {
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
    const sent: ServerMessage[] = [];
    const session = {
      id: "store-session",
      playerId: CHARACTER_ID,
      storeOperationPending: false,
      account: {
        id: "00000000-0000-4000-8000-000000000002",
        supabaseUserId: "store-user",
        email: null,
        bannedUntil: null,
        premiumUntil: null,
        mantusCoins: 500,
        language: "en",
        uiSettings: {},
      },
      send: (message: ServerMessage) => sent.push(message),
      sendError: vi.fn(),
    } as unknown as Session;
    const registry = {
      sessionFor: (characterId: string) =>
        characterId === CHARACTER_ID ? session : undefined,
    } as unknown as SessionRegistry;
    const purchase = vi.fn<MantusStoreStore["purchase"]>().mockResolvedValue({
      status: "committed",
      balance: 250,
      premiumUntil: new Date(30 * 24 * 60 * 60 * 1_000),
    });
    const service = new MantusStoreService(world, registry, { purchase });

    service.handle(session, { type: "store-open" }, 0);
    const state = sent.at(-1);
    expect(state).toMatchObject({
      type: "store-state",
      balance: 500,
    });
    if (state?.type !== "store-state") return;
    expect(state.categories[0]?.id).toBe("premium-time");
    expect(state.categories[0]?.offers[0]).toEqual({
      id: "premium-30",
      price: 250,
      premiumDays: 30,
      featured: true,
    });

    service.handle(
      session,
      { type: "store-purchase", offerId: "premium-30" },
      0,
    );
    await service.stop();
    service.applyResolvedOutcomes(0);

    expect(purchase).toHaveBeenCalledWith({
      accountId: "00000000-0000-4000-8000-000000000002",
      characterId: CHARACTER_ID,
      offer: {
        id: "premium-30",
        price: 250,
        premiumDays: 30,
        featured: true,
      },
    });
    expect(session.account?.mantusCoins).toBe(250);
    expect(player.accountTierAt(0)).toBe("premium");
    expect(sent.at(-1)).toEqual({
      type: "store-purchase-completed",
      offerId: "premium-30",
      balance: 250,
      accountTier: "premium",
      premiumDaysRemaining: 30,
    });
  });

  it("rejects unknown offer ids before calling storage", () => {
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
    world.addPlayer(
      new Player(
        makeCharacter(CHARACTER_ID, "Store Hero"),
        { x: 10, y: 10, z: 7 },
        0,
      ),
    );
    const sent: ServerMessage[] = [];
    const session = {
      id: "store-session",
      playerId: CHARACTER_ID,
      storeOperationPending: false,
      account: {
        id: "00000000-0000-4000-8000-000000000002",
        mantusCoins: 500,
      },
      send: (message: ServerMessage) => sent.push(message),
      sendError: vi.fn(),
    } as unknown as Session;
    const registry = {
      sessionFor: () => session,
    } as unknown as SessionRegistry;
    const purchase = vi.fn<MantusStoreStore["purchase"]>();
    const service = new MantusStoreService(world, registry, { purchase });

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
});
