import { describe, expect, it } from "vitest";
import type { Position } from "@tibia/protocol";
import { ItemCatalog } from "../item/ItemCatalog";
import type { ItemType } from "../item/ItemType";
import type {
  WorldItemSource,
  WorldItemSourceContent,
} from "../item/WorldItemSource";
import {
  buildQuestChestDefinitions,
  type QuestSystem2Entry,
} from "./buildQuestChestDefinitions";

function itemType(id: number, overrides: Partial<ItemType> = {}): ItemType {
  return {
    id,
    clientId: id,
    name: `item ${id}`,
    spriteId: 1,
    stackable: false,
    maxCount: 100,
    weight: 10,
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
  };
}

const CHEST_TYPE_ID = 100;
const BARE_ITEM_TYPE_ID = 300;
const HEAVY_STATUE_TYPE_ID = 301;
const REWARD_TYPE_ID = 200;
const NAILED_DOWN_TYPE_ID = 999;

const catalog = new ItemCatalog([
  itemType(CHEST_TYPE_ID, { containerCapacity: 8, pickupable: false }),
  itemType(BARE_ITEM_TYPE_ID, { stackable: true }),
  itemType(HEAVY_STATUE_TYPE_ID, { pickupable: false }),
  itemType(REWARD_TYPE_ID),
  itemType(201, { stackable: true }),
  itemType(NAILED_DOWN_TYPE_ID, { pickupable: false }),
]);

function content(
  typeId: number,
  attributes: Record<string, unknown> = {},
  contents: WorldItemSourceContent[] = [],
): WorldItemSourceContent {
  return { typeId, attributes, contents };
}

function worldItem(
  typeId: number,
  position: Position,
  attributes: Record<string, unknown>,
  contents: WorldItemSourceContent[] = [],
): WorldItemSource {
  return {
    seedKey: `test:${position.x}:${position.y}:${position.z}:1`,
    mapName: "test",
    mapVersion: "v1",
    typeId,
    attributes,
    position,
    stackIndex: 1,
    contents,
  };
}

const at = (x: number): Position => ({ x, y: 50, z: 7 });

function build(
  worldItems: WorldItemSource[],
  entries: QuestSystem2Entry[] = [],
  existing: Array<{ positions: Position[] }> = [],
) {
  return buildQuestChestDefinitions(worldItems, catalog, entries, existing);
}

describe("buildQuestChestDefinitions", () => {
  it("grants a single content bare, keyed by the chest uid", () => {
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4001 }, [
        content(REWARD_TYPE_ID, { actionId: 77, text: "hi" }),
      ]),
    ]);
    expect(result.chests).toEqual([
      {
        uniqueId: 4001,
        itemTypeId: CHEST_TYPE_ID,
        positions: [at(1)],
        lootedKey: "chest-storage:4001",
        reward: [{ typeId: REWARD_TYPE_ID, count: 1, actionId: 77, text: "hi" }],
      },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("wraps 2-8 contents in a bag", () => {
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4002 }, [
        content(REWARD_TYPE_ID),
        content(201, { count: 5 }),
      ]),
    ]);
    expect(result.chests[0]).toMatchObject({
      containerTypeId: 2853,
      reward: [
        { typeId: REWARD_TYPE_ID, count: 1 },
        { typeId: 201, count: 5 },
      ],
    });
  });

  it("wraps 9-20 contents in a backpack", () => {
    const contents = Array.from({ length: 12 }, () => content(REWARD_TYPE_ID));
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4003 }, contents),
    ]);
    expect(result.chests[0]?.containerTypeId).toBe(2854);
    expect(result.chests[0]?.reward).toHaveLength(12);
  });

  it("wraps more than 20 contents in a copy of the chest itself", () => {
    const contents = Array.from({ length: 21 }, () => content(REWARD_TYPE_ID));
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4004 }, contents),
    ]);
    expect(result.chests[0]?.containerTypeId).toBe(CHEST_TYPE_ID);
  });

  it("grants a non-container host as the reward itself", () => {
    const result = build([
      worldItem(BARE_ITEM_TYPE_ID, at(1), {
        actionId: 2000,
        uniqueId: 4005,
        count: 3,
      }),
    ]);
    expect(result.chests).toEqual([
      {
        uniqueId: 4005,
        itemTypeId: BARE_ITEM_TYPE_ID,
        positions: [at(1)],
        lootedKey: "chest-storage:4005",
        reward: [{ typeId: BARE_ITEM_TYPE_ID, count: 3 }],
      },
    ]);
  });

  it("excludes a non-takeable bare host", () => {
    const result = build([
      worldItem(HEAVY_STATUE_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4006 }),
    ]);
    expect(result.chests).toEqual([]);
    expect(result.skipped).toEqual([
      {
        uniqueId: 4006,
        position: at(1),
        status: "excluded",
        reason: "reward item is not takeable",
      },
    ]);
  });

  it("excludes hosts without a storage uid", () => {
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000 }, [
        content(REWARD_TYPE_ID),
      ]),
    ]);
    expect(result.chests).toEqual([]);
    expect(result.skipped[0]).toMatchObject({
      status: "excluded",
      reason: "no storage uid; Canary grants nothing either",
    });
  });

  it("excludes hosts whose uid exceeds 65535", () => {
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 70_000 }, [
        content(REWARD_TYPE_ID),
      ]),
    ]);
    expect(result.chests).toEqual([]);
    expect(result.skipped[0]).toMatchObject({
      status: "excluded",
      reason: "no storage uid; Canary grants nothing either",
    });
  });

  it("defers nested container rewards", () => {
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4007 }, [
        content(CHEST_TYPE_ID, {}, [content(REWARD_TYPE_ID)]),
      ]),
    ]);
    expect(result.chests).toEqual([]);
    expect(result.skipped).toEqual([
      {
        uniqueId: 4007,
        position: at(1),
        status: "deferred",
        reason: "nested container reward",
      },
    ]);
  });

  it("defers contents with unsupported attributes, naming the keys", () => {
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4008 }, [
        content(REWARD_TYPE_ID, { charges: 3, count: 1 }),
      ]),
    ]);
    expect(result.skipped).toEqual([
      {
        uniqueId: 4008,
        position: at(1),
        status: "deferred",
        reason: "unsupported content attributes: charges",
      },
    ]);
  });

  it("excludes non-takeable content rewards", () => {
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4009 }, [
        content(NAILED_DOWN_TYPE_ID),
      ]),
    ]);
    expect(result.skipped).toEqual([
      {
        uniqueId: 4009,
        position: at(1),
        status: "excluded",
        reason: `reward item ${NAILED_DOWN_TYPE_ID} is not takeable`,
      },
    ]);
  });

  it("resolves specialQuests aids to their storage constants and merges twins", () => {
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 51715, uniqueId: 111 }, [
        content(REWARD_TYPE_ID),
      ]),
      worldItem(CHEST_TYPE_ID, at(2), { actionId: 51715, uniqueId: 112 }, [
        content(REWARD_TYPE_ID),
      ]),
    ]);
    expect(result.chests).toEqual([
      {
        uniqueId: 41156,
        itemTypeId: CHEST_TYPE_ID,
        positions: [at(1), at(2)],
        lootedKey: "chest-storage:41156",
        reward: [{ typeId: REWARD_TYPE_ID, count: 1 }],
      },
    ]);
  });

  it("joins aid-2001 hosts against importable quest_system2 entries", () => {
    const entries: QuestSystem2Entry[] = [
      {
        uniqueId: 3084,
        storage: 41_982,
        items: [{ itemId: REWARD_TYPE_ID, count: 2, actionId: 9 }],
        status: "importable",
      },
      {
        uniqueId: 3112,
        storage: 41_276,
        items: [{ itemId: REWARD_TYPE_ID, count: 1 }],
        status: "deferred",
        reason: "storage state machine",
      },
      {
        uniqueId: 3999,
        storage: 1,
        items: [],
        status: "deferred",
        reason: "unmapped deferral",
      },
    ];
    const result = build(
      [
        worldItem(CHEST_TYPE_ID, at(1), { actionId: 2001, uniqueId: 3084 }),
        worldItem(CHEST_TYPE_ID, at(2), { actionId: 2001, uniqueId: 3112 }),
        worldItem(CHEST_TYPE_ID, at(3), { actionId: 2001, uniqueId: 7777 }),
      ],
      entries,
    );
    expect(result.chests).toEqual([
      {
        uniqueId: 3084,
        itemTypeId: CHEST_TYPE_ID,
        positions: [at(1)],
        lootedKey: "chest-storage:41982",
        reward: [{ typeId: REWARD_TYPE_ID, count: 2, actionId: 9 }],
      },
    ]);
    expect(result.skipped).toEqual([
      {
        uniqueId: 3112,
        position: at(2),
        status: "deferred",
        reason: "storage state machine",
      },
      // Deferred config entry with no map item still surfaces its reason.
      { uniqueId: 3999, status: "deferred", reason: "unmapped deferral" },
      {
        uniqueId: 7777,
        position: at(3),
        status: "deferred",
        reason: "no quest_system2 config entry",
      },
    ]);
  });

  it("throws when two generated chests collide on a position", () => {
    expect(() =>
      build([
        worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4010 }, [
          content(REWARD_TYPE_ID),
        ]),
        worldItem(BARE_ITEM_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4011 }),
      ]),
    ).toThrow(/collide at/);
  });

  it("throws when one uid maps to conflicting definitions", () => {
    expect(() =>
      build([
        worldItem(CHEST_TYPE_ID, at(1), { actionId: 51715 }, [
          content(REWARD_TYPE_ID),
        ]),
        worldItem(CHEST_TYPE_ID, at(2), { actionId: 51715 }, [
          content(201, { count: 4 }),
        ]),
      ]),
    ).toThrow(/conflicting definitions/);
  });

  it("skips quest items shadowed by an already-imported chest position", () => {
    const result = build(
      [
        worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 4012 }, [
          content(REWARD_TYPE_ID),
        ]),
      ],
      [],
      [{ positions: [at(1)] }],
    );
    expect(result.chests).toEqual([]);
    expect(result.skipped).toEqual([
      {
        uniqueId: 4012,
        position: at(1),
        status: "excluded",
        reason:
          "shadowed by an existing chest definition at this position (Canary dispatches uniqueId actions before actionId)",
      },
    ]);
  });

  it("notes Canary side effects it does not reproduce", () => {
    const result = build([
      worldItem(CHEST_TYPE_ID, at(1), { actionId: 2000, uniqueId: 50_950 }, [
        content(REWARD_TYPE_ID),
      ]),
    ]);
    expect(result.chests).toHaveLength(1);
    expect(result.notes).toEqual([
      {
        uniqueId: 50_950,
        positions: [at(1)],
        effect:
          "Canary also sets Storage.Quest.U7_4.TheAncientTombs.DefaultStart (40401) = 1 (hotaQuest table)",
      },
    ]);
  });
});
