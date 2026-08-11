import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import type { MapItem } from "../MapItem";
import { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { ExerciseTrainingHandler } from "./ExerciseTrainingHandler";

const EXERCISE_SWORD = 28_552;
const EXERCISE_ROD = 28_556;
const EPIC_EXERCISE_SWORD = 60_002;
const LEGENDARY_EXERCISE_BOW = 60_106;
const EXERCISE_DUMMY = 28_558;
const BACKPACK_ID = "00000000-0000-4000-8000-000000000099";
const WEAPON_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_POSITION = { x: 5, y: 5, z: 7 } as const;
const DUMMY_POSITION = { x: 5, y: 4, z: 7 } as const;
const FAR_DUMMY_POSITION = { x: 8, y: 5, z: 7 } as const;
/** Every walkable tile of the test grid the player can stand on. */
const PROTECTION_ZONE: ReadonlyArray<readonly [number, number, number]> = [
  [5, 5, 7],
  [4, 5, 7],
];

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function seededDummy(position: Position): {
  position: Position;
  item: MapItem;
} {
  const instanceId = `test:${position.x}:${position.y}:${position.z}:1`;
  return {
    position: { ...position },
    item: {
      instanceId,
      itemId: EXERCISE_DUMMY,
      stackIndex: 1,
      mutable: false,
      source: {
        seedKey: instanceId,
        mapName: "test",
        mapVersion: "v1",
        typeId: EXERCISE_DUMMY,
        attributes: {},
        position: { ...position },
        stackIndex: 1,
        contents: [],
      },
    },
  };
}

async function makeHarness(
  options: {
    weaponTypeId?: number;
    charges?: number;
    dummyPositions?: ReadonlyArray<Position>;
    protectionZone?: boolean;
    premium?: boolean;
  } = {},
) {
  const world = new World(
    gridMapData({
      name: "exercise-test",
      width: 10,
      height: 8,
      blocked: [],
      floors: [7],
      groundSpeed: 50,
      ...(options.protectionZone === false
        ? {}
        : { protectionZones: PROTECTION_ZONE }),
      items: (options.dummyPositions ?? [DUMMY_POSITION]).map(seededDummy),
    }),
    25,
  );
  const registry = new SessionRegistry();
  const visibility = new Visibility(world, registry);
  const store = new MemoryItemStore(catalog);
  store.seed({
    id: BACKPACK_ID,
    typeId: 2854,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId: "actor", slot: "backpack" },
  });
  const weapon: Item = {
    id: WEAPON_ID,
    typeId: options.weaponTypeId ?? EXERCISE_SWORD,
    count: 1,
    attributes: { charges: options.charges ?? 500 },
    version: 1,
    location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
  };
  store.seed(weapon);
  const items = new ItemIntentHandler(store, catalog, world, visibility);
  const progression = {
    awardSkillTries: vi.fn(),
    awardMagicProgress: vi.fn(),
  } as unknown as ProgressionSystem;
  const training = new ExerciseTrainingHandler(
    world,
    catalog,
    items,
    registry,
    visibility,
    progression,
    1,
  );
  const player = new Player(
    makeCharacter("actor", "Trainee"),
    { ...PLAYER_POSITION },
    0,
    options.premium ? new Date(9_999_999) : undefined,
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
  const session = new Session("actor", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = "actor";
  registry.add(session);
  registry.bindPlayer(session);
  // Missiles are gated on the viewer knowing the creature that threw them;
  // joining the world is what normally seeds the trainer's own id.
  session.knownCreatureIds.add("actor");
  items.attach(await items.load("actor", 400));

  /**
   * Runs one training tick and lets its store operation commit. `commitAt`
   * moves the clock the outcome lands on, which is how a slow charge write is
   * simulated: the handler measures the round trip from exactly that gap.
   */
  const tick = async (now: number, commitAt = now) => {
    training.tick(now);
    // `load` awaits the character's in-flight store operation first.
    await items.load("actor", 400);
    items.applyResolvedOutcomes(commitAt);
  };

  const use = (now: number, target: Position = DUMMY_POSITION) =>
    training.handle(
      session,
      {
        type: "use-item-with",
        itemId: WEAPON_ID,
        revision: 1,
        targetPosition: { ...target },
      },
      now,
    );

  /** Charges left on the training weapon; 0 once it has been spent away. */
  const chargesLeft = (): number => {
    const stored = items
      .inventorySnapshot("actor")
      ?.items.find((item) => item.id === WEAPON_ID)?.attributes.charges;
    return typeof stored === "number" ? stored : 0;
  };

  return {
    training,
    items,
    player,
    session,
    sent,
    progression,
    tick,
    use,
    chargesLeft,
  };
}

function conditionTexts(sent: ReadonlyArray<ServerMessage>): string[] {
  return sent.flatMap((message) =>
    message.type === "combat-log" ? [message.text] : [],
  );
}

describe("ExerciseTrainingHandler", () => {
  it("trains, spends exactly one charge, and draws the dummy's hit effect", async () => {
    const harness = await makeHarness();

    expect(harness.use(1_000)).toBe(true);
    // The first tick buys the charge; the hit it paid for lands on the next.
    await harness.tick(1_000);
    await harness.tick(1_005);

    expect(harness.chargesLeft()).toBe(499);
    expect(harness.progression.awardSkillTries).toHaveBeenCalledWith(
      "actor",
      expect.any(String),
      "sword",
      7,
      expect.any(Number),
    );
    expect(harness.sent).toContainEqual(
      expect.objectContaining({
        type: "magic-effect",
        position: { ...DUMMY_POSITION },
        effectId: 10,
      }),
    );
  });

  it("spends one charge per interval, never one per tick", async () => {
    const harness = await makeHarness();
    harness.use(1_000);

    await harness.tick(1_000);
    // Well inside the vocation's attack-speed interval.
    await harness.tick(1_050);
    await harness.tick(1_100);

    expect(harness.chargesLeft()).toBe(499);
  });

  it("swings 10% faster on a premium account (VIP benefit)", async () => {
    // Base 2000 ms interval; premium trains every round(2000 / 1.1) = 1818 ms.
    const premium = await makeHarness({ premium: true });
    const free = await makeHarness();
    premium.use(1_000);
    free.use(1_000);

    await premium.tick(1_000);
    await free.tick(1_000);
    await premium.tick(1_005);
    await free.tick(1_005);
    // 2900 ms: past the premium interval (2818), inside the free one (3000).
    await premium.tick(2_900);
    await free.tick(2_900);

    expect(premium.chargesLeft()).toBe(498);
    expect(free.chargesLeft()).toBe(499);
  });

  it("buys charges ahead when a write is slower than the tier's interval", async () => {
    // A charge write that takes seven and a half intervals to commit. Spending
    // one charge per round trip would cap the tier at a fraction of its rate,
    // so the next write buys the hits that fall inside the latency instead.
    const harness = await makeHarness({
      weaponTypeId: EPIC_EXERCISE_SWORD,
      charges: 100,
    });
    harness.use(1_000);

    // First write measures the round trip; the second sizes itself from it.
    await harness.tick(1_000, 4_000);
    await harness.tick(4_000, 7_000);

    const spent = 100 - harness.chargesLeft();
    const hits = harness.sent.filter(
      (message) => message.type === "magic-effect",
    ).length;
    expect(spent).toBe(9);
    // Charges are bought ahead of the hits they pay for, never behind them.
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThanOrEqual(spent);
  });

  it("refuses a second training run while one is already active", async () => {
    const harness = await makeHarness();

    expect(harness.use(1_000)).toBe(true);
    expect(harness.use(1_100)).toBe(true);

    expect(conditionTexts(harness.sent)).toContain("You are already training!");
  });

  it("stops training when the trainer leaves the protection zone", async () => {
    const harness = await makeHarness();
    harness.use(1_000);
    await harness.tick(1_000);
    harness.player.moveTo({ x: 6, y: 5, z: 7 });

    await harness.tick(10_000);

    expect(conditionTexts(harness.sent)).toContain(
      "You are no longer in a protection zone, the training has stopped.",
    );
    expect(harness.chargesLeft()).toBe(499);
  });

  it("stops training when the trainer steps off the tile they started on", async () => {
    const harness = await makeHarness();
    harness.use(1_000);
    await harness.tick(1_000);
    // Still in the protection zone, still next to the dummy: Canary ends the
    // run on the step itself, whatever the step was.
    harness.player.moveTo({ x: 4, y: 5, z: 7 });

    await harness.tick(10_000);
    await harness.tick(20_000);

    expect(conditionTexts(harness.sent)).toContain("You have stopped training.");
    expect(harness.chargesLeft()).toBe(499);
  });

  it("keeps training a far-use dummy while the trainer stands still", async () => {
    const harness = await makeHarness({
      weaponTypeId: EXERCISE_ROD,
      dummyPositions: [FAR_DUMMY_POSITION],
    });
    harness.use(1_000, FAR_DUMMY_POSITION);

    await harness.tick(1_000);
    await harness.tick(10_000);

    expect(conditionTexts(harness.sent)).not.toContain(
      "You have stopped training.",
    );
    expect(harness.chargesLeft()).toBeLessThan(500);
  });

  it("rejects a melee weapon used on a dummy out of reach", async () => {
    const harness = await makeHarness({
      dummyPositions: [FAR_DUMMY_POSITION],
    });

    expect(harness.use(1_000, FAR_DUMMY_POSITION)).toBe(true);
    await harness.tick(1_000);

    expect(conditionTexts(harness.sent)).toContain("Get closer to the dummy.");
    expect(harness.chargesLeft()).toBe(500);
  });

  it("lets a rod train at range and draws its distance missile", async () => {
    const harness = await makeHarness({
      weaponTypeId: EXERCISE_ROD,
      dummyPositions: [FAR_DUMMY_POSITION],
    });

    expect(harness.use(1_000, FAR_DUMMY_POSITION)).toBe(true);
    await harness.tick(1_000);
    await harness.tick(1_005);

    expect(harness.progression.awardMagicProgress).toHaveBeenCalledWith(
      "actor",
      expect.any(String),
      600,
      expect.any(Number),
    );
    expect(harness.sent).toContainEqual(
      expect.objectContaining({
        type: "distance-missile",
        to: { ...FAR_DUMMY_POSITION },
        missileId: 37,
      }),
    );
  });

  it("destroys the weapon when its last charge is spent", async () => {
    const harness = await makeHarness({ charges: 1 });
    harness.use(1_000);

    await harness.tick(1_000);
    await harness.tick(1_005);
    await harness.tick(1_010);

    expect(
      harness.items
        .inventorySnapshot("actor")
        ?.items.find((item) => item.id === WEAPON_ID),
    ).toBeUndefined();
    expect(conditionTexts(harness.sent)).toContain(
      "Your training weapon has disappeared.",
    );
  });

  it("lands five epic hits for every one a stock weapon lands", async () => {
    // Twenty seconds sampled every 100ms, long enough that the tick grid does
    // not round the ratio away.
    const hitTimes = Array.from({ length: 201 }, (_, tick) => 1_000 + tick * 100);
    const epic = await makeHarness({
      weaponTypeId: EPIC_EXERCISE_SWORD,
      charges: 100,
    });
    const stock = await makeHarness({ charges: 100 });
    epic.use(1_000);
    stock.use(1_000);

    for (const now of hitTimes) {
      await epic.tick(now);
      await stock.tick(now);
    }

    const epicHits = 100 - epic.chargesLeft();
    const stockHits = 100 - stock.chargesLeft();
    expect(stockHits).toBeGreaterThan(5);
    // Both paces land their first hit at once, so the ratio holds between the
    // hits after it; one tick of slack, as the grids cannot align identically.
    expect(epicHits - 1).toBeGreaterThanOrEqual((stockHits - 1) * 5 - 1);
    expect(epicHits - 1).toBeLessThanOrEqual((stockHits - 1) * 5 + 1);
    // Same tries per hit as the stock tier: only the pace differs.
    expect(epic.progression.awardSkillTries).toHaveBeenLastCalledWith(
      "actor",
      expect.any(String),
      "sword",
      7,
      expect.any(Number),
    );
    expect(epic.sent).toContainEqual(
      expect.objectContaining({
        type: "magic-effect",
        position: { ...DUMMY_POSITION },
        effectId: 303,
      }),
    );
  });

  it("draws the legendary tier's own missile and hit effect", async () => {
    const harness = await makeHarness({
      weaponTypeId: LEGENDARY_EXERCISE_BOW,
      charges: 10,
      dummyPositions: [FAR_DUMMY_POSITION],
    });

    expect(harness.use(1_000, FAR_DUMMY_POSITION)).toBe(true);
    await harness.tick(1_000);
    await harness.tick(1_005);

    expect(harness.sent).toContainEqual(
      expect.objectContaining({
        type: "distance-missile",
        to: { ...FAR_DUMMY_POSITION },
        missileId: 4,
      }),
    );
    expect(harness.sent).toContainEqual(
      expect.objectContaining({
        type: "magic-effect",
        position: { ...FAR_DUMMY_POSITION },
        effectId: 177,
      }),
    );
  });

  it("ignores a use aimed at a tile with no dummy on it", async () => {
    const harness = await makeHarness({ dummyPositions: [] });

    expect(harness.use(1_000)).toBe(false);
  });
});
