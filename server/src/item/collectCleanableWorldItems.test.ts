import { beforeAll, describe, expect, it } from "vitest";
import { collectCleanableWorldItems } from "./collectCleanableWorldItems";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { loadItemCatalog } from "./loadItemCatalog";

const GOLD_TYPE = 3031;
/** Fresh chicken corpse: not pickupable, so Canary never cleans it either. */
const FRESH_CORPSE_TYPE = 6042;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function ground(
  id: string,
  typeId: number,
  x: number,
  extra: Partial<Item> = {},
): Item {
  return {
    id,
    typeId,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "world", position: { x, y: 2, z: 7 }, stackIndex: 0 },
    ...extra,
  };
}

function worldOf(
  items: ReadonlyArray<Item>,
  zones: {
    protectionZones?: ReadonlyArray<number>;
    houseTiles?: ReadonlyArray<number>;
  } = {},
) {
  return {
    worldItemRoots: () => items,
    isProtectionZone: (position: { x: number }) =>
      (zones.protectionZones ?? []).includes(position.x),
    getHouseId: (position: { x: number }) =>
      (zones.houseTiles ?? []).includes(position.x) ? 1 : undefined,
  };
}

const options = { cleanProtectionZones: false };

describe("collectCleanableWorldItems", () => {
  it("takes loose pickupable ground items", () => {
    const world = worldOf([ground("a", GOLD_TYPE, 2)]);

    expect(
      collectCleanableWorldItems(world, catalog, options).map((i) => i.id),
    ).toEqual(["a"]);
  });

  it("spares map furniture, house floors and unique or action items", () => {
    const world = worldOf(
      [
        ground("seed", GOLD_TYPE, 2, { seedKey: "otservbr:2:2:7:0" }),
        ground("house", GOLD_TYPE, 3),
        ground("unique", GOLD_TYPE, 4, { attributes: { uniqueId: 5001 } }),
        ground("action", GOLD_TYPE, 5, { attributes: { actionId: 3001 } }),
        ground("corpse", FRESH_CORPSE_TYPE, 6),
        ground("loose", GOLD_TYPE, 7),
      ],
      { houseTiles: [3] },
    );

    expect(
      collectCleanableWorldItems(world, catalog, options).map((i) => i.id),
    ).toEqual(["loose"]);
  });

  it("spares protection zones unless the server opts in", () => {
    const world = worldOf([ground("depot", GOLD_TYPE, 2)], {
      protectionZones: [2],
    });

    expect(collectCleanableWorldItems(world, catalog, options)).toEqual([]);
    expect(
      collectCleanableWorldItems(world, catalog, {
        cleanProtectionZones: true,
      }).map((i) => i.id),
    ).toEqual(["depot"]);
  });
});
