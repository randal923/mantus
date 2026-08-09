import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import type { Creature } from "../creature/Creature";
import { gridMapData } from "../gridMapData";
import type { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import type { MapItem } from "../MapItem";
import { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { MovementGateDefinition } from "./movementGateTables";
import { positionKey } from "../positionKey";
import { PressurePlateRegistry } from "./PressurePlateRegistry";

const PLATE_UP = 419;
const PLATE_DOWN = 420;
const SPIKE_TRAP = 3_482;
const SPRUNG_SPIKE_TRAP = 3_481;
const WOLF_TRAP = 12_368;

const PLATE = { x: 5, y: 4, z: 7 } as const;
const START = { x: 5, y: 5, z: 7 } as const;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function seededMapItem(
  itemId: number,
  position: Position,
  attributes: Record<string, unknown> = {},
): MapItem {
  const instanceId = `test:${position.x}:${position.y}:${position.z}:1`;
  return {
    instanceId,
    itemId,
    stackIndex: 1,
    mutable: true,
    source: {
      seedKey: instanceId,
      mapName: "test",
      mapVersion: "v1",
      typeId: itemId,
      attributes,
      position: { ...position },
      stackIndex: 1,
      contents: [],
    },
  };
}

async function makeHarness(options: {
  items: ReadonlyArray<{ position: Position; item: MapItem }>;
  protectionZones?: ReadonlyArray<readonly [number, number, number]>;
  level?: number;
  gates?: ReadonlyMap<string, MovementGateDefinition>;
  premiumUntil?: Date;
}) {
  const world = new World(
    gridMapData({
      name: "test",
      width: 10,
      height: 8,
      blocked: [],
      items: [...options.items],
      protectionZones: options.protectionZones ?? [],
    }),
    25,
    undefined,
    (itemId) => catalog.get(itemId)?.weight,
  );
  const registry = new SessionRegistry();
  const store = new MemoryItemStore();
  const items = new ItemIntentHandler(
    store,
    catalog,
    world,
    new Visibility(world, registry),
  );
  const snapBacks: Position[] = [];
  const damages: Array<{ creatureId: string; minimum: number; type: string }> =
    [];
  const effects: Array<{ position: Position; effectId: number }> = [];
  const plates = new PressurePlateRegistry(
    world,
    catalog,
    items,
    (_session, player, to) => {
      snapBacks.push({ ...to });
      world.relocateCreature(player, to);
    },
    (creature: Creature, damage) => {
      damages.push({
        creatureId: creature.id,
        minimum: damage.minimum,
        type: damage.type,
      });
    },
    (position, effectId) => {
      effects.push({ position: { ...position }, effectId });
    },
    options.gates,
  );
  const level = options.level ?? 1;
  const player = new Player(
    {
      ...makeCharacter("walker"),
      level,
      experience: BigInt(getExperienceForLevel(level)),
    },
    START,
    undefined,
    options.premiumUntil ?? null,
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
  const session = new Session("walker", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = "walker";
  registry.add(session);
  items.attach(await items.load("walker", 400));

  /** Walks one tile and runs the step hooks in the tick's order. */
  const step = (direction: "north" | "south", now: number) => {
    const result = world.tryMove(player, direction, now);
    if (!result.moved) throw new Error(`step ${direction} was blocked`);
    plates.onStepOut(session, player, result.from, now);
    plates.onStepIn(session, player, result.from, now);
  };
  return {
    world,
    items,
    plates,
    player,
    session,
    sent,
    snapBacks,
    damages,
    effects,
    step,
  };
}

const tileItemIds = (world: World, position: Position) =>
  world.getMapItems(position).map((item) => item.itemId);

describe("PressurePlateRegistry", () => {
  it("depresses a plate on step-in and releases it on step-out", async () => {
    const harness = await makeHarness({
      items: [{ position: PLATE, item: seededMapItem(PLATE_UP, PLATE) }],
    });
    harness.step("north", 1_000);
    expect(tileItemIds(harness.world, PLATE)).toEqual([PLATE_DOWN]);

    harness.step("south", 2_000);
    expect(tileItemIds(harness.world, PLATE)).toEqual([PLATE_UP]);

    await harness.items.stopPersists();
  });

  it("leaves the plate depressed while another creature still stands on it", async () => {
    const harness = await makeHarness({
      items: [{ position: PLATE, item: seededMapItem(PLATE_UP, PLATE) }],
    });
    harness.step("north", 1_000);
    expect(tileItemIds(harness.world, PLATE)).toEqual([PLATE_DOWN]);

    // A second walker on the tile keeps it occupied when the first leaves.
    const squatter = new Player(makeCharacter("squatter"), PLATE);
    harness.world.removePlayer("walker");
    harness.world.addPlayer(squatter);
    harness.plates.onStepOut(harness.session, squatter, PLATE, 2_000);
    expect(tileItemIds(harness.world, PLATE)).toEqual([PLATE_DOWN]);
  });

  it("pushes a player below the plate's level requirement back", async () => {
    const harness = await makeHarness({
      items: [
        {
          position: PLATE,
          item: seededMapItem(PLATE_UP, PLATE, { actionId: 1_050 }),
        },
      ],
      level: 49,
    });
    harness.step("north", 1_000);

    expect(harness.snapBacks).toEqual([START]);
    expect(harness.player.position).toEqual(START);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "The tile seems to be protected against unwanted intruders.",
    });
  });

  it("lets a player at the plate's required level through", async () => {
    const harness = await makeHarness({
      items: [
        {
          position: PLATE,
          item: seededMapItem(PLATE_UP, PLATE, { actionId: 1_050 }),
        },
      ],
      level: 50,
    });
    harness.step("north", 1_000);

    expect(harness.snapBacks).toEqual([]);
    expect(harness.player.position).toEqual(PLATE);
  });

  it("fails closed on a storage-gated plate until quest storage ships", async () => {
    const harness = await makeHarness({
      items: [
        {
          position: PLATE,
          item: seededMapItem(PLATE_UP, PLATE, { actionId: 40_001 }),
        },
      ],
      level: 500,
    });
    harness.step("north", 1_000);

    expect(harness.snapBacks).toEqual([START]);
    expect(harness.player.position).toEqual(START);
  });

  it("springs a spike trap once, transforming it and dealing damage", async () => {
    const harness = await makeHarness({
      items: [{ position: PLATE, item: seededMapItem(SPIKE_TRAP, PLATE) }],
    });
    harness.step("north", 1_000);

    expect(tileItemIds(harness.world, PLATE)).toEqual([SPRUNG_SPIKE_TRAP]);
    expect(harness.damages).toEqual([
      { creatureId: "walker", minimum: 15, type: "physical" },
    ]);
    await harness.items.stopPersists();
  });

  it("never springs a trap inside a protection zone", async () => {
    const harness = await makeHarness({
      items: [{ position: PLATE, item: seededMapItem(SPIKE_TRAP, PLATE) }],
      protectionZones: [[PLATE.x, PLATE.y, PLATE.z]],
    });
    harness.step("north", 1_000);

    expect(tileItemIds(harness.world, PLATE)).toEqual([SPIKE_TRAP]);
    expect(harness.damages).toEqual([]);
  });

  it("ignores players on monster-only traps", async () => {
    const harness = await makeHarness({
      items: [{ position: PLATE, item: seededMapItem(WOLF_TRAP, PLATE) }],
    });
    harness.step("north", 1_000);

    expect(tileItemIds(harness.world, PLATE)).toEqual([WOLF_TRAP]);
    expect(harness.damages).toEqual([]);
  });

  const FAIL_SPOT = { x: 2, y: 2, z: 7 } as const;
  const levelGate = (): ReadonlyMap<string, MovementGateDefinition> =>
    new Map([
      [
        positionKey(PLATE),
        {
          requirement: { kind: "level", minimum: 2 },
          failPosition: FAIL_SPOT,
          message: "You need to be at least Level 2 in order to pass.",
          effectId: 13,
        },
      ],
    ]);
  const premiumGate = (): ReadonlyMap<string, MovementGateDefinition> =>
    new Map([
      [
        positionKey(PLATE),
        {
          requirement: { kind: "premium" },
          failPosition: FAIL_SPOT,
          effectId: 13,
        },
      ],
    ]);

  it("bounces an underleveled player to the gate's fail spot with the line", async () => {
    const harness = await makeHarness({ items: [], gates: levelGate() });
    harness.step("north", 1_000);

    expect(harness.snapBacks).toEqual([FAIL_SPOT]);
    expect(harness.effects).toEqual([{ position: FAIL_SPOT, effectId: 13 }]);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "combat-log",
      kind: "condition",
      text: "You need to be at least Level 2 in order to pass.",
    });
  });

  it("lets a player at the required level through a level gate", async () => {
    const harness = await makeHarness({
      items: [],
      level: 2,
      gates: levelGate(),
    });
    harness.step("north", 1_000);

    expect(harness.snapBacks).toEqual([]);
    expect(harness.effects).toEqual([]);
  });

  it("bounces a free account off a premium gate, silently", async () => {
    const harness = await makeHarness({ items: [], gates: premiumGate() });
    harness.step("north", 1_000);

    expect(harness.snapBacks).toEqual([FAIL_SPOT]);
    expect(harness.effects).toEqual([{ position: FAIL_SPOT, effectId: 13 }]);
    expect(
      harness.sent.filter((message) => message.type === "combat-log"),
    ).toEqual([]);
  });

  it("lets a premium account through a premium gate", async () => {
    const harness = await makeHarness({
      items: [],
      gates: premiumGate(),
      premiumUntil: new Date(1_000_000),
    });
    harness.step("north", 1_000);

    expect(harness.snapBacks).toEqual([]);
    expect(harness.effects).toEqual([]);
  });

  it("ships both Rookgaard bridge gates", async () => {
    const { MOVEMENT_GATES } = await import("./movementGateTables");
    expect(
      MOVEMENT_GATES.get(positionKey({ x: 32_091, y: 32_175, z: 6 })),
    ).toMatchObject({ requirement: { kind: "level", minimum: 2 } });
    expect(
      MOVEMENT_GATES.get(positionKey({ x: 32_063, y: 32_193, z: 7 })),
    ).toMatchObject({ requirement: { kind: "premium" } });
  });
});
