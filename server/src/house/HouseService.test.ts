import { describe, expect, it } from "vitest";
import type { AccountTier, Position, ServerMessage } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { DepotCacheEvent } from "../depot/DepotCacheEvent";
import type { DepotService } from "../depot/DepotService";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import type { MapData } from "../MapData";
import { Player } from "../Player";
import { positionKey } from "../positionKey";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { HouseInfo } from "./HouseInfo";
import { HouseService } from "./HouseService";
import { MemoryHouseStore } from "./MemoryHouseStore";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

const HOUSE_TILES: ReadonlyMap<number, ReadonlyArray<Position>> = new Map([
  [
    1,
    [
      { x: 50, y: 50, z: 7 },
      { x: 50, y: 51, z: 7 },
    ],
  ],
  [2, [{ x: 60, y: 50, z: 7 }]],
]);

const CONTENT: ReadonlyMap<number, HouseInfo> = new Map([
  [
    1,
    {
      houseId: 1,
      name: "Test Villa",
      entry: { x: 50, y: 51, z: 7 },
      rent: 5_000,
      townId: 8,
      size: 20,
      guildhall: false,
      beds: 2,
    },
  ],
  [
    2,
    {
      houseId: 2,
      name: "Shack",
      entry: { x: 60, y: 50, z: 7 },
      rent: 1_000,
      townId: 8,
      size: 10,
      guildhall: false,
      beds: 1,
    },
  ],
  [
    3,
    {
      houseId: 3,
      name: "Clanhall",
      entry: { x: 70, y: 50, z: 7 },
      rent: 100_000,
      townId: 8,
      size: 300,
      guildhall: true,
      beds: 10,
    },
  ],
  [
    4,
    {
      houseId: 4,
      name: "Harbour Flat",
      entry: { x: 80, y: 50, z: 7 },
      rent: 2_000,
      townId: 9,
      size: 15,
      guildhall: false,
      beds: 1,
    },
  ],
]);

interface TestPlayer {
  readonly player: Player;
  readonly session: Session;
  readonly sent: ServerMessage[];
}

interface Harness {
  readonly world: World;
  readonly store: MemoryHouseStore;
  readonly service: HouseService;
  readonly depotEvents: Array<{ characterId: string; upserts: number }>;
  join(
    id: string,
    name: string,
    position?: Position,
    level?: number,
    accountTier?: AccountTier,
  ): TestPlayer;
  flush(now?: number): Promise<void>;
}

function makeHarness(): Harness {
  const base = gridMapData({
    name: "house-test",
    width: 100,
    height: 100,
    blocked: [],
    floors: [7],
  });
  const tileToHouse = new Map<string, number>();
  for (const [houseId, tiles] of HOUSE_TILES) {
    for (const tile of tiles) tileToHouse.set(positionKey(tile), houseId);
  }
  const map: MapData = {
    ...base,
    getHouseId: (position) => tileToHouse.get(positionKey(position)),
    getHouseTiles: (houseId) => HOUSE_TILES.get(houseId),
    getTownName: (townId) =>
      townId === 8 ? "Thais" : townId === 9 ? "Venore" : undefined,
  };
  const world = new World(map, 25);
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const store = new MemoryHouseStore();
  const depotEvents: Array<{ characterId: string; upserts: number }> = [];
  const depot = {
    applyExternalCacheEvent: (characterId: string, event: DepotCacheEvent) =>
      depotEvents.push({ characterId, upserts: event.upserts?.length ?? 0 }),
  } as unknown as DepotService;
  const persistence = {
    saveNow: () => {},
  } as unknown as CharacterPersistence;
  const service = new HouseService(
    world,
    registry,
    visibility,
    persistence,
    depot,
    CONTENT,
    store,
  );
  world.setHousePolicy((player, position) =>
    service.canUseHouseTile(player.id, position),
  );
  let nextSpawnX = 20;
  return {
    world,
    store,
    service,
    depotEvents,
    join(id, name, position, level = 100, accountTier = "premium") {
      nextSpawnX += 2;
      const spawn = position ?? { x: nextSpawnX, y: 20, z: 7 };
      const character = {
        ...makeCharacter(id, name),
        level,
        experience: BigInt(getExperienceForLevel(level)),
      };
      const premiumUntil =
        accountTier === "premium" ? new Date("2100-01-01T00:00:00.000Z") : null;
      const player = new Player(character, spawn, 0, premiumUntil);
      world.addPlayer(player);
      store.registerCharacter(id, name);
      const sent: ServerMessage[] = [];
      const session = {
        id: `session-${id}`,
        playerId: id,
        viewRange: { x: 8, y: 6 },
        knownCreatureIds: new Set([id]),
        knownMapItemTiles: new Map(),
        attackTargetId: null,
        movementDirection: null,
        bufferedMovementDirection: null,
        autoWalkDirections: [],
        send: (message: ServerMessage) => sent.push(message),
        sendError: () => {},
      } as unknown as Session;
      sessions.set(id, session);
      return { player, session, sent };
    },
    async flush(now = 0) {
      for (let round = 0; round < 3; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
    },
  };
}

function messagesOf<TType extends ServerMessage["type"]>(
  testPlayer: TestPlayer,
  type: TType,
): Array<Extract<ServerMessage, { type: TType }>> {
  return testPlayer.sent.filter(
    (message): message is Extract<ServerMessage, { type: TType }> =>
      message.type === type,
  );
}

function lastFailure(testPlayer: TestPlayer) {
  return messagesOf(testPlayer, "house-action-failed").at(-1);
}

async function buyHouseOne(
  harness: Harness,
  buyer: TestPlayer,
  clock: { now: number },
): Promise<void> {
  clock.now += 1_100;
  harness.service.handle(
    buyer.session,
    { type: "house-buy", houseId: 1 },
    clock.now,
  );
  await harness.flush(clock.now);
}

describe("HouseService", () => {
  it("rejects house purchases from free accounts", () => {
    const harness = makeHarness();
    const buyer = harness.join(
      A,
      "Alice",
      { x: 50, y: 51, z: 7 },
      100,
      "free",
    );
    harness.store.setBalance(A, 1_000_000);

    harness.service.handle(
      buyer.session,
      { type: "house-buy", houseId: 1 },
      1_100,
    );

    expect(lastFailure(buyer)?.reason).toBe("premium-required");
    expect(harness.store.balanceOf(A)).toBe(1_000_000);
  });

  it("sells an unowned house only to a leveled buyer standing at it", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const low = harness.join(C, "Lowbie", { x: 50, y: 50, z: 7 }, 20);
    clock.now += 1_100;
    harness.service.handle(
      low.session,
      { type: "house-buy", houseId: 1 },
      clock.now,
    );
    expect(lastFailure(low)?.reason).toBe("level-too-low");

    const far = harness.join(B, "Farley", { x: 90, y: 90, z: 7 });
    harness.store.setBalance(B, 1_000_000);
    clock.now += 1_100;
    harness.service.handle(
      far.session,
      { type: "house-buy", houseId: 1 },
      clock.now,
    );
    expect(lastFailure(far)?.reason).toBe("not-at-entry");

    const buyer = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 1_000_000);
    await buyHouseOne(harness, buyer, clock);
    expect(harness.store.balanceOf(A)).toBe(1_000_000 - 20 * 1_000);
    const state = messagesOf(buyer, "house-state").at(-1);
    expect(state?.house?.myAccess).toBe("owner");
    expect(state?.house?.ownerName).toBe("Alice");
    expect(
      messagesOf(buyer, "house-event").some(
        (event) => event.kind === "purchased",
      ),
    ).toBe(true);
  });

  it("rejects guildhalls, forged ids, double buys, and second houses", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 10_000_000);
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-buy", houseId: 999 },
      clock.now,
    );
    expect(lastFailure(alice)?.reason).toBe("not-found");
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-buy", houseId: 3 },
      clock.now,
    );
    expect(lastFailure(alice)?.reason).toBe("guildhall");
    await buyHouseOne(harness, alice, clock);

    const bob = harness.join(B, "Bob", { x: 50, y: 52, z: 7 });
    harness.store.setBalance(B, 10_000_000);
    clock.now += 1_100;
    harness.service.handle(
      bob.session,
      { type: "house-buy", houseId: 1 },
      clock.now,
    );
    expect(lastFailure(bob)?.reason).toBe("already-owned");

    // The owner cannot buy a second house.
    harness.world.relocateCreature(alice.player, { x: 60, y: 51, z: 7 });
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-buy", houseId: 2 },
      clock.now,
    );
    expect(lastFailure(alice)?.reason).toBe("own-house-exists");
  });

  it("authorizes walking at execution time and evicts on revocation", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 1_000_000);
    await buyHouseOne(harness, alice, clock);
    // Free the entry tile so the revocation sweep can land there.
    harness.world.relocateCreature(alice.player, { x: 52, y: 52, z: 7 });

    const bob = harness.join(B, "Bob", { x: 49, y: 50, z: 7 });
    clock.now += 1_100;
    const blocked = harness.world.tryMove(bob.player, "east", clock.now);
    expect(blocked.moved).toBe(false);

    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-set-access", kind: "guest", targetName: "Bob", grant: true },
      clock.now,
    );
    await harness.flush(clock.now);
    clock.now += 1_100;
    const allowed = harness.world.tryMove(bob.player, "east", clock.now);
    expect(allowed.moved).toBe(true);
    expect(bob.player.position).toEqual({ x: 50, y: 50, z: 7 });

    // Revoking mid-session takes effect on the very next step and sweeps
    // the ex-guest to the entry tile.
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      {
        type: "house-set-access",
        kind: "guest",
        targetName: "Bob",
        grant: false,
      },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(bob.player.position).toEqual({ x: 50, y: 51, z: 7 });
    clock.now += 1_100;
    const afterRevoke = harness.world.tryMove(bob.player, "north", clock.now);
    expect(afterRevoke.moved).toBe(false);
    expect(harness.service.canUseHouseTile(B, { x: 50, y: 50, z: 7 })).toBe(
      false,
    );
    // Stepping out of the house stays possible.
    clock.now += 1_100;
    const stepOut = harness.world.tryMove(bob.player, "south", clock.now);
    expect(stepOut.moved).toBe(true);
  });

  it("lets the owner kick a visitor to the entry", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 1_000_000);
    await buyHouseOne(harness, alice, clock);
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-set-access", kind: "guest", targetName: "Bob", grant: true },
      clock.now,
    );
    await harness.flush(clock.now);
    const bob = harness.join(B, "Bob", { x: 50, y: 50, z: 7 });
    // Move the owner off the entry tile so the kick lands there.
    harness.world.relocateCreature(alice.player, { x: 52, y: 52, z: 7 });
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-kick", targetCharacterId: B },
      clock.now,
    );
    expect(bob.player.position).toEqual({ x: 50, y: 51, z: 7 });
  });

  it("transfers ownership with atomic money and item legs", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 100_000);
    await buyHouseOne(harness, alice, clock);
    const aliceAfterBuy = harness.store.balanceOf(A);
    const bob = harness.join(B, "Bob", { x: 30, y: 20, z: 7 });
    harness.store.setBalance(B, 90_000);
    const chair: Item = {
      id: "itm-chair",
      typeId: 42,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "world",
        position: { x: 50, y: 50, z: 7 },
        stackIndex: 1,
      },
    };
    harness.store.registerWorldItem(chair);

    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-transfer-offer", targetName: "Bob", price: 50_000 },
      clock.now,
    );
    const incoming = messagesOf(bob, "house-transfer-incoming").at(-1);
    expect(incoming).toEqual({
      type: "house-transfer-incoming",
      houseId: 1,
      houseName: "Test Villa",
      fromName: "Alice",
      price: 50_000,
    });

    clock.now += 1_100;
    harness.service.handle(
      bob.session,
      { type: "house-transfer-respond", houseId: 1, accept: true },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(harness.store.balanceOf(B)).toBe(40_000);
    expect(harness.store.balanceOf(A)).toBe(aliceAfterBuy + 50_000);
    // The previous owner's belongings went to their inbox, exactly once.
    expect(harness.store.inboxOf(A).map((item) => item.id)).toEqual([
      "itm-chair",
    ]);
    expect(harness.depotEvents).toEqual([{ characterId: A, upserts: 1 }]);
    expect(harness.service.canUseHouseTile(A, { x: 50, y: 50, z: 7 })).toBe(
      false,
    );
    expect(harness.service.canUseHouseTile(B, { x: 50, y: 50, z: 7 })).toBe(
      true,
    );
    expect(
      messagesOf(alice, "house-event").some(
        (event) => event.kind === "transferred",
      ),
    ).toBe(true);
  });

  it("resolves a transfer-accept racing an abandon to one consistent outcome", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 100_000);
    await buyHouseOne(harness, alice, clock);
    const bob = harness.join(B, "Bob", { x: 30, y: 20, z: 7 });
    harness.store.setBalance(B, 100_000);
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-transfer-offer", targetName: "Bob", price: 25_000 },
      clock.now,
    );
    const goldBefore = harness.store.balanceOf(A) + harness.store.balanceOf(B);

    clock.now += 1_100;
    harness.service.handle(alice.session, { type: "house-abandon" }, clock.now);
    harness.service.handle(
      bob.session,
      { type: "house-transfer-respond", houseId: 1, accept: true },
      clock.now,
    );
    await harness.flush(clock.now);

    const bobOwns = harness.service.canUseHouseTile(B, { x: 50, y: 50, z: 7 });
    const paid = harness.store.balanceOf(B) === 100_000 - 25_000;
    // Either the abandon won (house unowned, no money moved) or the
    // transfer won (Bob owns and paid) — never both, never partial.
    expect(bobOwns).toBe(paid);
    expect(harness.store.balanceOf(A) + harness.store.balanceOf(B)).toBe(
      goldBefore,
    );
    const snapshot = await harness.store.loadSnapshot(1);
    if (bobOwns) {
      expect(snapshot?.ownerCharacterId).toBe(B);
    } else {
      expect(snapshot).toBeNull();
      expect(harness.service.canUseHouseTile(A, { x: 50, y: 50, z: 7 })).toBe(
        false,
      );
    }
  });

  it("charges rent from the bank once per due period and warns when broke", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 21_000);
    await buyHouseOne(harness, alice, clock);
    expect(harness.store.balanceOf(A)).toBe(1_000);

    const DAY = 24 * 3600 * 1000;
    clock.now += 31 * DAY;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    // Broke: one warning, one day of grace, no charge.
    expect(harness.store.balanceOf(A)).toBe(1_000);
    const warning = messagesOf(alice, "house-event").find(
      (event) => event.kind === "rent-warning",
    );
    expect(warning?.warningsLeft).toBe(6);
    // Replaying the scan immediately does not warn again.
    harness.service.tick(clock.now + 61_000);
    await harness.flush(clock.now);
    expect(
      messagesOf(alice, "house-event").filter(
        (event) => event.kind === "rent-warning",
      ),
    ).toHaveLength(1);

    // Funded again: the next due charge pays and resets the warnings.
    harness.store.setBalance(A, 10_000);
    clock.now += 2 * DAY;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(harness.store.balanceOf(A)).toBe(5_000);
    expect(
      messagesOf(alice, "house-event").some(
        (event) => event.kind === "rent-paid",
      ),
    ).toBe(true);
  });

  it("evicts after the final rent warning and delivers items exactly once", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 20_000);
    await buyHouseOne(harness, alice, clock);
    harness.store.registerWorldItem({
      id: "itm-bed",
      typeId: 42,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "world",
        position: { x: 50, y: 50, z: 7 },
        stackIndex: 1,
      },
    });

    const DAY = 24 * 3600 * 1000;
    clock.now += 31 * DAY;
    for (let day = 0; day < 7; day += 1) {
      harness.service.tick(clock.now);
      await harness.flush(clock.now);
      clock.now += DAY + 61_000;
    }
    expect(await harness.store.loadSnapshot(1)).toBeNull();
    expect(harness.store.inboxOf(A).map((item) => item.id)).toEqual([
      "itm-bed",
    ]);
    expect(
      messagesOf(alice, "house-event").some((event) => event.kind === "evicted"),
    ).toBe(true);
    // The ex-owner standing inside was swept to the entry and cannot re-enter.
    expect(harness.service.canUseHouseTile(A, { x: 50, y: 50, z: 7 })).toBe(
      false,
    );
    // A replayed scan after eviction is a no-op.
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(harness.store.inboxOf(A)).toHaveLength(1);
  });

  it("keeps house lists public-only and scopes state to the viewer", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 1_000_000);
    await buyHouseOne(harness, alice, clock);
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-set-access", kind: "guest", targetName: "Bob", grant: true },
      clock.now,
    );
    await harness.flush(clock.now);

    const stranger = harness.join(C, "Cara", { x: 49, y: 51, z: 7 });
    clock.now += 1_100;
    harness.service.handle(
      stranger.session,
      { type: "house-open", houseId: 1 },
      clock.now,
    );
    const seen = messagesOf(stranger, "house-state").at(-1)?.house;
    expect(seen?.ownerName).toBe("Alice");
    expect(seen?.myAccess).toBe("none");
    expect(seen?.guests).toBeUndefined();
    expect(seen?.paidUntil).toBeUndefined();
    expect(seen?.pendingTransfer).toBeUndefined();

    clock.now += 1_100;
    harness.service.handle(
      stranger.session,
      { type: "house-browse", townId: 8 },
      clock.now,
    );
    const list = messagesOf(stranger, "house-list").at(-1);
    expect(list?.entries).toHaveLength(3);
    expect(list?.entries.every((entry) => entry.townId === 8)).toBe(true);
    expect(list?.towns).toEqual([
      { townId: 8, townName: "Thais" },
      { townId: 9, townName: "Venore" },
    ]);
    expect(
      list?.entries.find((entry) => entry.houseId === 1)?.ownerName,
    ).toBe("Alice");
  });
});
