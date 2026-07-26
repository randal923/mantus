import { describe, expect, it } from "vitest";
import type { Position, ViewRange } from "@tibia/protocol";
import type { MapItem } from "../MapItem";
import type { Player } from "../Player";
import type { WorldAction } from "./WorldAction";
import {
  WORLD_ACTION_REQUIREMENTS,
  checkWorldActionPreconditions,
} from "./worldActionPreconditions";

/** Every kind the registry can dispatch, so a new one must be listed here. */
const REGISTERED_KINDS = [
  "chest",
  "clock",
  "daily-shrine",
  "door",
  "lever",
  "podium",
  "read",
  "rotate",
  "write",
] as const;

const POSITION: Position = { x: 5, y: 4, z: 7 };
const VIEW_RANGE: ViewRange = { x: 9, y: 7 };

const item: MapItem = {
  instanceId: "seed:5:4:7:1",
  itemId: 1_638,
  stackIndex: 1,
  mutable: true,
};

const player = { id: "actor", position: { x: 5, y: 5, z: 7 }, level: 1 } as
  unknown as Player;

function makeWorld(options: {
  items?: ReadonlyArray<MapItem>;
  visible?: boolean;
  houseId?: number;
} = {}) {
  return {
    getMapItems: () => options.items ?? [item],
    canSee: () => options.visible ?? true,
    isOccupied: () => false,
    getWorldItem: () => undefined,
    getWorldSubtree: () => [],
    lootOrigin: () => undefined,
    seedOrigin: () => undefined,
    getMapAction: () => undefined,
    ...(options.houseId === undefined
      ? {}
      : { getHouseId: () => options.houseId }),
  } as unknown as Parameters<typeof checkWorldActionPreconditions>[0]["world"];
}

const check = (
  action: WorldAction,
  overrides: Partial<Parameters<typeof checkWorldActionPreconditions>[0]> = {},
) =>
  checkWorldActionPreconditions({
    action: action as Parameters<
      typeof checkWorldActionPreconditions
    >[0]["action"],
    player,
    position: POSITION,
    viewRange: VIEW_RANGE,
    world: makeWorld(),
    houseAccess: () => true,
    itemOperationPending: false,
    ...overrides,
  });

const doorAction = { kind: "door", item } as unknown as WorldAction;

describe("worldActionPreconditions", () => {
  it("declares requirements for every dispatchable kind", () => {
    // A handler added without a requirements entry fails here, not in
    // production: the registry always runs this table before dispatch.
    expect(Object.keys(WORLD_ACTION_REQUIREMENTS).sort()).toEqual(
      [...REGISTERED_KINDS].sort(),
    );
    for (const kind of REGISTERED_KINDS) {
      expect(WORLD_ACTION_REQUIREMENTS[kind].reach).toMatch(
        /^(adjacent|visible)$/,
      );
    }
  });

  it("requires every mutating kind to be exclusive and item-checked", () => {
    for (const kind of REGISTERED_KINDS) {
      // Clock/sign reads and shrine/window opens mutate nothing.
      if (kind === "clock" || kind === "read" || kind === "daily-shrine") {
        continue;
      }
      expect(WORLD_ACTION_REQUIREMENTS[kind].exclusive).toBe(true);
      expect(WORLD_ACTION_REQUIREMENTS[kind].itemStillPlaced).toBe(true);
      expect(WORLD_ACTION_REQUIREMENTS[kind].houseAccess).toBe(true);
    }
  });

  it("passes when everything is current", () => {
    expect(check(doorAction)).toBeNull();
  });

  it("hides an out-of-view tile entirely", () => {
    expect(
      check(doorAction, {
        player: { ...player, position: { x: 40, y: 40, z: 7 } } as Player,
        world: makeWorld({ visible: false }),
      }),
    ).toBe("out-of-view");
  });

  it("rejects an in-view but non-adjacent mutation", () => {
    expect(
      check(doorAction, {
        player: { ...player, position: { x: 1, y: 1, z: 7 } } as Player,
      }),
    ).toBe("out-of-reach");
  });

  it("rejects while an item operation is still in flight", () => {
    expect(check(doorAction, { itemOperationPending: true })).toBe("busy");
  });

  it("rejects a resolution whose item left the tile", () => {
    expect(check(doorAction, { world: makeWorld({ items: [] }) })).toBe(
      "stale-item",
    );
  });

  it("rejects an unauthorized house tile", () => {
    expect(
      check(doorAction, {
        world: makeWorld({ houseId: 7 }),
        houseAccess: () => false,
      }),
    ).toBe("no-house-access");
  });

  it("lets a read through from a distance", () => {
    expect(
      check({ kind: "read", item } as unknown as WorldAction, {
        player: { ...player, position: { x: 1, y: 1, z: 7 } } as Player,
      }),
    ).toBeNull();
  });
});
