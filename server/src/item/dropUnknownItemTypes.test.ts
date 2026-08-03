import { describe, expect, it, vi } from "vitest";
import { ItemCatalog } from "./ItemCatalog";
import type { Item } from "./Item";
import type { ItemType } from "./ItemType";
import { dropUnknownItemTypes } from "./dropUnknownItemTypes";

const type = (id: number): ItemType =>
  ({
    id,
    clientId: id,
    name: `item ${id}`,
    spriteId: id,
    stackable: false,
    maxCount: 1,
    weight: 100,
    pickupable: true,
    movable: true,
    light: { intensity: 0, color: 0 },
    elevation: 0,
    render: {},
  }) as unknown as ItemType;

const catalog = new ItemCatalog([type(1), type(2)]);

const carried = (id: string, typeId: number, containerId?: string): Item => ({
  id,
  typeId,
  count: 1,
  attributes: {},
  version: 1,
  location: containerId
    ? { kind: "container", containerId, slot: 0 }
    : { kind: "equipment", characterId: "actor", slot: "backpack" },
});

describe("dropUnknownItemTypes", () => {
  it("keeps every row when the catalog knows all of them", () => {
    const items = [carried("bag", 1), carried("sword", 2, "bag")];

    expect(dropUnknownItemTypes(items, catalog, "actor")).toBe(items);
  });

  it("hides a row whose type the catalog lost, and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = [carried("bag", 1), carried("orphan", 60_010, "bag")];

    const loaded = dropUnknownItemTypes(items, catalog, "actor");

    expect(loaded.map((item) => item.id)).toEqual(["bag"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("60010"));
    warn.mockRestore();
  });

  it("takes a hidden container's contents with it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = [
      carried("bag", 1),
      carried("ghost-bag", 60_010, "bag"),
      carried("inside", 2, "ghost-bag"),
      carried("deeper", 2, "inside"),
    ];

    const loaded = dropUnknownItemTypes(items, catalog, "actor");

    // A child left behind would sit in the cache with no reachable parent.
    expect(loaded.map((item) => item.id)).toEqual(["bag"]);
    vi.restoreAllMocks();
  });
});
