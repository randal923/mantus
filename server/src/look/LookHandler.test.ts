import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import type { MapItem } from "../MapItem";
import { Player } from "../Player";
import { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { LookHandler } from "./LookHandler";

const GOLD_COIN = 3_031;
const PLATE_ARMOR = 3_357;
const CLOSED_DOOR = 1_638;
const TILE = { x: 5, y: 4, z: 7 } as const;
const STANDING = { x: 5, y: 5, z: 7 } as const;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function seededMapItem(
  itemId: number,
  position: Position,
  attributes: Record<string, unknown> = {},
  count?: number,
): MapItem {
  const instanceId = `test:${itemId}:${position.x}:${position.y}:${position.z}`;
  return {
    instanceId,
    itemId,
    stackIndex: 1,
    mutable: true,
    ...(count === undefined ? {} : { count }),
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

function makeHarness(
  items: ReadonlyArray<{ position: Position; item: MapItem }> = [],
  lookups: ConstructorParameters<typeof LookHandler>[2] = {},
) {
  const world = new World(
    gridMapData({
      name: "test",
      width: 60,
      height: 60,
      blocked: [],
      items: [...items],
    }),
    25,
  );
  const look = new LookHandler(world, catalog, lookups);
  const makeSession = (characterId: string, position: Position) => {
    const player = new Player(
      { ...makeCharacter(characterId, characterId) },
      position,
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
    const session = new Session(characterId, "127.0.0.1", socket, {
      maxPendingIntents: 16,
      maxProtocolViolations: 5,
      initialViewRange: { x: 9, y: 7 },
    });
    session.playerId = characterId;
    return { player, session, sent };
  };
  return { world, look, makeSession };
}

const lookTexts = (sent: ReadonlyArray<ServerMessage>) =>
  sent.flatMap((message) =>
    message.type === "look-text" ? [message.text] : [],
  );

describe("LookHandler map looks", () => {
  it("describes the server's own world item, with its real stack count", () => {
    const harness = makeHarness([
      { position: TILE, item: seededMapItem(GOLD_COIN, TILE, { count: 40 }, 40) },
    ]);
    const { session, sent } = harness.makeSession("actor", STANDING);
    harness.look.handle(session, {
      type: "look",
      target: { kind: "map", position: TILE, itemId: GOLD_COIN },
    });
    expect(lookTexts(sent)).toEqual(["You see 40 gold coins.\nThey weigh 4.00 oz."]);
  });

  it("falls back to the pinned catalog for static scenery the server does not track", () => {
    const harness = makeHarness();
    const { session, sent } = harness.makeSession("actor", STANDING);
    harness.look.handle(session, {
      type: "look",
      target: { kind: "map", position: TILE, itemId: PLATE_ARMOR },
    });
    expect(lookTexts(sent)).toEqual([
      "You see a plate armor (Arm:10).\nIt weighs 120.00 oz.",
    ]);
  });

  it("rejects an item id that is not in the catalog", () => {
    const harness = makeHarness();
    const { session, sent } = harness.makeSession("actor", STANDING);
    harness.look.handle(session, {
      type: "look",
      target: { kind: "map", position: TILE, itemId: 65_535 },
    });
    expect(sent).toEqual([]);
  });

  it("refuses a tile outside the session's own view range", () => {
    const harness = makeHarness([
      { position: TILE, item: seededMapItem(GOLD_COIN, TILE) },
    ]);
    const { session, sent } = harness.makeSession("actor", { x: 40, y: 40, z: 7 });
    harness.look.handle(session, {
      type: "look",
      target: { kind: "map", position: TILE, itemId: GOLD_COIN },
    });
    expect(sent).toEqual([]);
  });

  it("appends the public house ownership text to a house door", () => {
    const harness = makeHarness(
      [{ position: TILE, item: seededMapItem(CLOSED_DOOR, TILE) }],
      {
        house: () => ({
          name: "Sorcerer's Avenue Lab 2a",
          size: 33,
          price: 33_000,
          rent: 1_500,
          ownerName: "Shui Sorc",
          rentPeriodDays: 30,
        }),
      },
    );
    const { session, sent } = harness.makeSession("actor", STANDING);
    harness.look.handle(session, {
      type: "look",
      target: { kind: "map", position: TILE, itemId: CLOSED_DOOR },
    });
    expect(lookTexts(sent)[0]).toContain(
      "It belongs to house 'Sorcerer's Avenue Lab 2a'. Shui Sorc owns this house.",
    );
    expect(lookTexts(sent)[0]).toContain("It is 33 square meters.");
    // A house somebody owns does not advertise its price.
    expect(lookTexts(sent)[0]).not.toContain("It costs");
  });
});

describe("LookHandler creature looks", () => {
  it("describes a creature the client was already told about", () => {
    const harness = makeHarness();
    const { session, sent } = harness.makeSession("actor", STANDING);
    const monster = new Monster({
      id: "m1",
      type: {
        id: "rat",
        name: "Rat",
        description: "a rat",
        outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
        health: 20,
        maxHealth: 20,
      } as MonsterType,
      position: TILE,
      direction: "south",
      home: TILE,
      spawnRadius: 1,
    });
    harness.world.addCreature(monster);
    session.knownCreatureIds.add(monster.id);
    harness.look.handle(session, {
      type: "look",
      target: { kind: "creature", creatureId: monster.id },
    });
    expect(lookTexts(sent)).toEqual(["You see a rat."]);
  });

  it("never answers for a creature this client was not told about", () => {
    const harness = makeHarness();
    const { session, sent } = harness.makeSession("actor", STANDING);
    const monster = new Monster({
      id: "hidden",
      type: {
        id: "rat",
        name: "Rat",
        description: "a rat",
        outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
        health: 20,
        maxHealth: 20,
      } as MonsterType,
      position: TILE,
      direction: "south",
      home: TILE,
      spawnRadius: 1,
    });
    harness.world.addCreature(monster);
    harness.look.handle(session, {
      type: "look",
      target: { kind: "creature", creatureId: monster.id },
    });
    expect(sent).toEqual([]);
  });

  it("re-checks visibility at execution time, not when the click was queued", () => {
    const harness = makeHarness();
    const { session, sent } = harness.makeSession("actor", STANDING);
    const other = new Player(
      { ...makeCharacter("other", "Other") },
      { x: 6, y: 5, z: 7 },
    );
    harness.world.addPlayer(other);
    session.knownCreatureIds.add(other.id);
    // The target walks far away between the click and the tick.
    harness.world.relocateCreature(other, { x: 50, y: 50, z: 7 });
    harness.look.handle(session, {
      type: "look",
      target: { kind: "creature", creatureId: other.id },
    });
    expect(sent).toEqual([]);
  });

  it("answers a look at your own character without any visibility bookkeeping", () => {
    const harness = makeHarness();
    const { player, session, sent } = harness.makeSession("actor", STANDING);
    harness.look.handle(session, {
      type: "look",
      target: { kind: "creature", creatureId: player.id },
    });
    expect(lookTexts(sent)).toEqual(["You see yourself. You are a knight."]);
  });

  it("refuses every look before a character is joined", () => {
    const harness = makeHarness();
    const { session, sent } = harness.makeSession("actor", STANDING);
    session.playerId = null;
    harness.look.handle(session, {
      type: "look",
      target: { kind: "map", position: TILE, itemId: GOLD_COIN },
    });
    expect(sent).toEqual([]);
  });
});
