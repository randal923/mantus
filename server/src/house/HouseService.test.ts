import { describe, expect, it } from "vitest";
import {
  HOUSE_LIMITS,
  type AccountTier,
  type Position,
  type ServerMessage,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { DepotCacheEvent } from "../depot/DepotCacheEvent";
import type { DepotService } from "../depot/DepotService";
import { Monster } from "../creature/Monster";
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
import { STAMPED_LETTER_TYPE_ID } from "./deliverHouseLetter";
import { MemoryHouseStore } from "./MemoryHouseStore";

const DAY_MS = 24 * 3600 * 1000;
/** Longer than HouseService's auction scan interval, so a second scan runs. */
const AUCTION_SCAN_GAP_MS = 11_000;

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
  [
    3,
    [
      { x: 70, y: 50, z: 7 },
      { x: 70, y: 51, z: 7 },
    ],
  ],
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
  /** Live guild identities the access lists resolve against. */
  readonly guilds: Map<
    string,
    { guildId: string; guildName: string; rankName: string; isLeader: boolean }
  >;
  readonly depotEvents: Array<{ characterId: string; upserts: number }>;
  join(
    id: string,
    name: string,
    position?: Position,
    level?: number,
    accountTier?: AccountTier,
  ): TestPlayer;
  /** Drops the live session, as a logout would; the absence clock starts. */
  disconnect(id: string): void;
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
  const guilds = new Map<
    string,
    { guildId: string; guildName: string; rankName: string; isLeader: boolean }
  >();
  service.setGuildIdentityLookup((characterId) =>
    guilds.get(characterId) ?? null,
  );
  let nextSpawnX = 20;
  return {
    world,
    store,
    service,
    guilds,
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
        sendSerialized: (message: string) =>
          sent.push(JSON.parse(message) as ServerMessage),
        sendError: () => {},
      } as unknown as Session;
      sessions.set(id, session);
      return { player, session, sent };
    },
    disconnect(id) {
      sessions.delete(id);
    },
    async flush(now = 0) {
      for (let round = 0; round < 3; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
    },
  };
}

function makeMonster(position: Position): Monster {
  return new Monster({
    id: `rat-${position.x}-${position.y}`,
    type: {
      id: "rat",
      name: "Rat",
      description: "a rat",
      outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
      health: 20,
      maxHealth: 20,
      speed: 200,
      manaCost: 0,
      changeTarget: { intervalMs: 4_000, chance: 0 },
      light: { intensity: 0, color: 0 },
      experience: 5,
      corpseItemTypeId: 5964,
      race: "blood",
      faction: "default",
      enemyFactions: [],
      flags: {
        attackable: true,
        hostile: true,
        pushable: true,
        summonable: false,
        convinceable: false,
        illusionable: false,
        canPushItems: false,
        canPushCreatures: false,
        targetDistance: 1,
        runHealth: 5,
        staticAttackChance: 95,
        healthHidden: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false,
        isBlockable: true,
        rewardBoss: false,
      },
      targetStrategy: { nearest: 100, health: 0, damage: 0, random: 0 },
      attacks: [],
      defenses: [],
      elements: {},
      immunities: [],
      reflects: {},
      heals: {},
      events: [],
      callbacks: [],
      maxSummons: 0,
      summons: [],
      voices: [],
      loot: [],
    },
    position,
    direction: "south",
    home: position,
    spawnRadius: 10,
  });
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

  it("rejects forged ids, double buys, and second houses", async () => {
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
    // A guildhall is bought by a guild leader out of the guild balance.
    expect(lastFailure(alice)?.reason).toBe("not-authorized");
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
    expect(
      harness.store
        .inboxOf(A)
        .filter((item) => item.typeId === 42)
        .map((item) => item.id),
    ).toEqual(["itm-bed"]);
    // Six missed periods mailed six warning letters; the seventh evicted.
    expect(
      harness.store
        .inboxOf(A)
        .filter((item) => item.typeId === STAMPED_LETTER_TYPE_ID),
    ).toHaveLength(HOUSE_LIMITS.maxWarnings - 1);
    expect(
      messagesOf(alice, "house-event").some((event) => event.kind === "evicted"),
    ).toBe(true);
    // The ex-owner standing inside was swept to the entry and cannot re-enter.
    expect(harness.service.canUseHouseTile(A, { x: 50, y: 50, z: 7 })).toBe(
      false,
    );
    // A replayed scan after eviction is a no-op.
    const delivered = harness.store.inboxOf(A).length;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(harness.store.inboxOf(A)).toHaveLength(delivered);
  });

  it("warns an offline free owner at day 5, once per absence episode, and evicts at exactly day 7", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 25_000);
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
    // Premium lapsed at logout: the free 7-day rule applies.
    harness.store.registerCharacter(A, "Alice", { premiumUntilMs: clock.now });
    harness.store.setLastSeen(A, clock.now);
    harness.disconnect(A);
    const loggedOutAt = clock.now;

    // Day 5: one warning letter, mailed exactly once per episode.
    clock.now = loggedOutAt + 5 * DAY_MS;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    const letters = () =>
      harness.store
        .inboxOf(A)
        .filter((item) => item.typeId === STAMPED_LETTER_TYPE_ID);
    expect(letters()).toHaveLength(1);
    expect(letters()[0]?.attributes.text).toContain("2 day(s)");
    harness.service.tick(clock.now + 61_000);
    await harness.flush(clock.now);
    expect(letters()).toHaveLength(1);

    // Just short of 7 days (61s, so the next scan clears the interval):
    // still owned.
    clock.now = loggedOutAt + 7 * DAY_MS - 61_000;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(await harness.store.loadSnapshot(1)).not.toBeNull();

    // Exactly 7 days: evicted, items mailed home, tiles locked.
    clock.now = loggedOutAt + 7 * DAY_MS;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(await harness.store.loadSnapshot(1)).toBeNull();
    expect(
      harness.store
        .inboxOf(A)
        .filter((item) => item.typeId === 42)
        .map((item) => item.id),
    ).toEqual(["itm-bed"]);
    expect(harness.service.canUseHouseTile(A, { x: 50, y: 50, z: 7 })).toBe(
      false,
    );
    // A replayed scan after the eviction is a no-op.
    const delivered = harness.store.inboxOf(A).length;
    harness.service.tick(clock.now + 61_000);
    await harness.flush(clock.now);
    expect(harness.store.inboxOf(A)).toHaveLength(delivered);
  });

  it("gives a premium owner 10 days and re-warns on a new absence episode", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 25_000);
    await buyHouseOne(harness, alice, clock);
    harness.store.setLastSeen(A, clock.now);
    harness.disconnect(A);
    const loggedOutAt = clock.now;

    // Day 5 warning reflects the premium tier: 5 days left, not 2.
    clock.now = loggedOutAt + 5 * DAY_MS;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    const letters = () =>
      harness.store
        .inboxOf(A)
        .filter((item) => item.typeId === STAMPED_LETTER_TYPE_ID);
    expect(letters()).toHaveLength(1);
    expect(letters()[0]?.attributes.text).toContain("5 day(s)");

    // Day 8 would evict a free account; premium keeps the house.
    clock.now = loggedOutAt + 8 * DAY_MS;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(await harness.store.loadSnapshot(1)).not.toBeNull();

    // The owner returns briefly (a save advances last_seen_at), then logs
    // out again: a fresh episode warns again 5 days later.
    harness.store.setLastSeen(A, clock.now);
    const secondLogoutAt = clock.now;
    clock.now = secondLogoutAt + 5 * DAY_MS;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(letters()).toHaveLength(2);

    // Exactly 10 days into the second episode: evicted.
    clock.now = secondLogoutAt + 10 * DAY_MS;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(await harness.store.loadSnapshot(1)).toBeNull();
  });

  it("uses the premium tier at scan time when premium lapses mid-absence", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 25_000);
    await buyHouseOne(harness, alice, clock);
    // Premium covers the first 6 days of the absence, then lapses.
    harness.store.registerCharacter(A, "Alice", {
      premiumUntilMs: clock.now + 6 * DAY_MS,
    });
    harness.store.setLastSeen(A, clock.now);
    harness.disconnect(A);
    const loggedOutAt = clock.now;

    // Day 8: the lapsed account is judged by the free 7-day rule.
    clock.now = loggedOutAt + 8 * DAY_MS;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(await harness.store.loadSnapshot(1)).toBeNull();
  });

  it("never evicts an online owner, however stale the save anchor is", async () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 25_000);
    await buyHouseOne(harness, alice, clock);
    // Online but idle: the durable save anchor lags far past the threshold.
    harness.store.registerCharacter(A, "Alice", { premiumUntilMs: clock.now });
    harness.store.setLastSeen(A, clock.now - 30 * DAY_MS);

    clock.now += 61_000;
    harness.service.tick(clock.now);
    await harness.flush(clock.now);
    expect(await harness.store.loadSnapshot(1)).not.toBeNull();
    expect(
      harness.store
        .inboxOf(A)
        .filter((item) => item.typeId === STAMPED_LETTER_TYPE_ID),
    ).toHaveLength(0);
    expect(
      messagesOf(alice, "house-event").some((event) => event.kind === "evicted"),
    ).toBe(false);
  });

  it("exempts guildhalls from absence eviction at the store", async () => {
    const store = new MemoryHouseStore();
    const now = 1_000_000;
    store.registerCharacter(A, "Alice", { premiumUntilMs: now });
    store.registerGuild("guild-1", A, 1_000_000);
    await store.purchaseGuildhall({
      houseId: 3,
      characterId: A,
      guildId: "guild-1",
      price: 300_000,
      paidUntilMs: now + 30 * DAY_MS,
    });
    store.setLastSeen(A, now - 30 * DAY_MS);
    const thresholds = {
      warnAfterDays: HOUSE_LIMITS.absenceWarningDays,
      evictAfterDays: HOUSE_LIMITS.absenceEvictionDays,
      premiumEvictAfterDays: HOUSE_LIMITS.premiumAbsenceEvictionDays,
    };
    expect(
      await store.listAbsenceDueHouseIds({
        now: new Date(now),
        ...thresholds,
        limit: 20,
      }),
    ).toEqual([]);
    const result = await store.processAbsence({
      houseId: 3,
      now: new Date(now),
      ...thresholds,
      mapName: "house-test",
      tilePositions: HOUSE_TILES.get(3) ?? [],
      warningLetterText: () => "unused",
    });
    expect(result.status).toBe("skip");
    expect(await store.loadSnapshot(3)).not.toBeNull();
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

  it("escrows a bid, refunds the outbid holder, and blocks direct purchase", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    const bob = harness.join(B, "Bob", { x: 50, y: 50, z: 7 });
    harness.store.setBalance(A, 100_000);
    harness.store.setBalance(B, 100_000);

    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-bid", houseId: 1, amount: 20_000 },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(harness.store.balanceOf(A)).toBe(80_000);

    // A house under auction cannot be bought out from under the bidders.
    clock.now += 1_100;
    harness.service.handle(
      bob.session,
      { type: "house-buy", houseId: 1 },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(lastFailure(bob)?.reason).toBe("auction-active");

    // Beating the standing bid by less than the increment is rejected.
    clock.now += 1_100;
    harness.service.handle(
      bob.session,
      { type: "house-bid", houseId: 1, amount: 20_500 },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(lastFailure(bob)?.reason).toBe("bid-too-low");
    expect(harness.store.balanceOf(B)).toBe(100_000);

    clock.now += 1_100;
    harness.service.handle(
      bob.session,
      { type: "house-bid", houseId: 1, amount: 25_000 },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(harness.store.balanceOf(B)).toBe(75_000);
    // The outbid holder is made whole in the same transaction.
    expect(harness.store.balanceOf(A)).toBe(100_000);
    expect(
      messagesOf(alice, "house-event").at(-1),
    ).toMatchObject({ kind: "outbid", amount: 20_000 });

    clock.now += 1_100;
    harness.service.handle(
      bob.session,
      { type: "house-open", houseId: 1 },
      clock.now,
    );
    expect(messagesOf(bob, "house-state").at(-1)?.house?.auction).toMatchObject({
      bid: 25_000,
      bidderName: "Bob",
      mine: true,
    });
  });

  it("closes an auction exactly once across replayed scans", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 100_000);

    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-bid", houseId: 1, amount: 20_000 },
      clock.now,
    );
    await harness.flush(clock.now);

    const afterClose = clock.now + HOUSE_LIMITS.auctionDurationDays * DAY_MS + 1;
    harness.service.tick(afterClose);
    await harness.flush(afterClose);
    harness.service.tick(afterClose + AUCTION_SCAN_GAP_MS);
    await harness.flush(afterClose + AUCTION_SCAN_GAP_MS);

    const won = messagesOf(alice, "house-event").filter(
      (event) => event.kind === "auction-won",
    );
    expect(won).toHaveLength(1);
    // The escrow paid for the house; no second debit, no refund.
    expect(harness.store.balanceOf(A)).toBe(80_000);

    clock.now = afterClose + AUCTION_SCAN_GAP_MS + 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-open", houseId: 1 },
      clock.now,
    );
    const state = messagesOf(alice, "house-state").at(-1)?.house;
    expect(state?.ownerName).toBe("Alice");
    expect(state?.myAccess).toBe("owner");
    expect(state?.auction).toBeUndefined();
  });

  it("keeps monsters out of house tiles while letting them walk back out", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 100_000);
    await buyHouseOne(harness, alice, clock);

    // Standing just west of the house tile (50, 50).
    const rat = makeMonster({ x: 49, y: 50, z: 7 });
    harness.world.addCreature(rat);
    expect(
      harness.world.tryMoveCreature(rat, "east", clock.now + 10_000).moved,
    ).toBe(false);
    expect(rat.position).toEqual({ x: 49, y: 50, z: 7 });

    // A creature already inside — spawned or teleported there — walks out.
    harness.world.relocateCreature(rat, { x: 50, y: 50, z: 7 });
    expect(
      harness.world.tryMoveCreature(rat, "west", clock.now + 20_000).moved,
    ).toBe(true);
    expect(rat.position).toEqual({ x: 49, y: 50, z: 7 });
  });

  it("sells a guildhall to the leader out of the guild balance and opens it to members", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const leader = harness.join(A, "Alice", { x: 71, y: 50, z: 7 });
    const member = harness.join(B, "Bob", { x: 71, y: 51, z: 7 });
    harness.store.setBalance(A, 10_000_000);
    harness.store.registerGuild("guild-red-rose", A, 500_000);
    harness.guilds.set(A, {
      guildId: "guild-red-rose",
      guildName: "Red Rose",
      rankName: "Leader",
      isLeader: true,
    });
    harness.guilds.set(B, {
      guildId: "guild-red-rose",
      guildName: "Red Rose",
      rankName: "Member",
      isLeader: false,
    });

    // A member cannot spend the guild's gold.
    clock.now += 1_100;
    harness.service.handle(
      member.session,
      { type: "house-buy", houseId: 3 },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(lastFailure(member)?.reason).toBe("not-authorized");
    expect(harness.store.guildBalanceOf("guild-red-rose")).toBe(500_000);

    clock.now += 1_100;
    harness.service.handle(
      leader.session,
      { type: "house-buy", houseId: 3 },
      clock.now,
    );
    await harness.flush(clock.now);
    // The price left the guild balance, never the leader's own account.
    expect(harness.store.guildBalanceOf("guild-red-rose")).toBe(200_000);
    expect(harness.store.balanceOf(A)).toBe(10_000_000);

    // Guildhall tiles are open to the owning guild without an explicit list.
    const hall = { x: 70, y: 50, z: 7 };
    expect(harness.service.canUseHouseTile(B, hall)).toBe(true);
    harness.guilds.delete(B);
    expect(harness.service.canUseHouseTile(B, hall)).toBe(false);

    // The hall belongs to the guild: no personal transfer offer.
    clock.now += 1_100;
    harness.service.handle(
      leader.session,
      { type: "house-transfer-offer", targetName: "Bob", price: 0 },
      clock.now,
    );
    expect(lastFailure(leader)?.reason).toBe("guildhall");
  });

  it("grants guild access from a text list and revokes it the moment the guild is left", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 100_000);
    await buyHouseOne(harness, alice, clock);

    const bob = harness.join(B, "Bob", { x: 49, y: 50, z: 7 });
    harness.guilds.set(B, {
      guildId: "guild-red-rose",
      guildName: "Red Rose",
      rankName: "Member",
      isLeader: false,
    });

    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-set-list", kind: "guest", body: "@Red Rose" },
      clock.now,
    );
    await harness.flush(clock.now);

    const tile = { x: 50, y: 50, z: 7 };
    expect(harness.service.canUseHouseTile(B, tile)).toBe(true);
    expect(harness.service.canUseHouseDoor(B, tile)).toBe(true);

    // Leaving the guild is not cached anywhere: the next check fails.
    harness.guilds.delete(B);
    expect(harness.service.canUseHouseTile(B, tile)).toBe(false);
    expect(harness.service.canUseHouseDoor(B, tile)).toBe(false);
    expect(bob.player.id).toBe(B);
  });

  it("enforces a per-door list independently of the house-wide list", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 100_000);
    await buyHouseOne(harness, alice, clock);
    harness.join(B, "Bob", { x: 49, y: 50, z: 7 });

    const door = { x: 50, y: 50, z: 7 };
    const plain = { x: 50, y: 51, z: 7 };
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-set-list", kind: "guest", body: "Bob" },
      clock.now,
    );
    await harness.flush(clock.now);
    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-set-list", kind: "door", body: "Cara", door },
      clock.now,
    );
    await harness.flush(clock.now);

    // House-wide access still holds; only the listed door is narrower.
    expect(harness.service.canUseHouseTile(B, door)).toBe(true);
    expect(harness.service.canUseHouseDoor(B, plain)).toBe(true);
    expect(harness.service.canUseHouseDoor(B, door)).toBe(false);
    // The owner is never locked out of their own door.
    expect(harness.service.canUseHouseDoor(A, door)).toBe(true);
  });

  it("refuses a door list for a tile outside the managed house", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 100_000);
    await buyHouseOne(harness, alice, clock);

    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      {
        type: "house-set-list",
        kind: "door",
        body: "Cara",
        door: { x: 60, y: 50, z: 7 },
      },
      clock.now,
    );
    await harness.flush(clock.now);
    expect(lastFailure(alice)?.reason).toBe("not-a-door");
  });

  it("refunds the winner in full when eligibility lapsed before the close", async () => {
    const harness = makeHarness();
    const clock = { now: 0 };
    await harness.flush();
    const alice = harness.join(A, "Alice", { x: 50, y: 51, z: 7 });
    harness.store.setBalance(A, 100_000);

    clock.now += 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-bid", houseId: 1, amount: 20_000 },
      clock.now,
    );
    await harness.flush(clock.now);
    // Premium lapses between bid time and close time.
    harness.store.registerCharacter(A, "Alice", { premiumUntilMs: clock.now });

    const afterClose = clock.now + HOUSE_LIMITS.auctionDurationDays * DAY_MS + 1;
    harness.service.tick(afterClose);
    await harness.flush(afterClose);

    expect(messagesOf(alice, "house-event").at(-1)).toMatchObject({
      kind: "auction-refunded",
      amount: 20_000,
      detail: "premium-required",
    });
    expect(harness.store.balanceOf(A)).toBe(100_000);

    clock.now = afterClose + 1_100;
    harness.service.handle(
      alice.session,
      { type: "house-open", houseId: 1 },
      clock.now,
    );
    const state = messagesOf(alice, "house-state").at(-1)?.house;
    expect(state?.ownerName).toBeNull();
    expect(state?.auction).toBeUndefined();
  });
});
