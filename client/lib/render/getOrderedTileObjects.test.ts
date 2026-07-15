import { describe, expect, it } from "vitest";
import { getOrderedTileObjects } from "./getOrderedTileObjects";

describe("getOrderedTileObjects", () => {
  it("orders bottom, reversed common, and on-top objects", () => {
    const object = (
      name: string,
      flags: { ground?: boolean; onBottom?: boolean; onTop?: boolean } = {},
    ) => ({
      name,
      flags: {
        ground: flags.ground ?? false,
        groundBorder: false,
        onBottom: flags.onBottom ?? false,
        onTop: flags.onTop ?? false,
      },
    });
    const ordered = getOrderedTileObjects([
      object("ground", { ground: true }),
      {
        name: "border",
        flags: {
          ground: false,
          groundBorder: true,
          onBottom: false,
          onTop: false,
        },
      },
      object("wall", { onBottom: true }),
      object("first common"),
      object("last common"),
      object("arch", { onTop: true }),
    ]);

    expect(ordered.map(({ object }) => object.name)).toEqual([
      "ground",
      "border",
      "wall",
      "last common",
      "first common",
      "arch",
    ]);
    expect(ordered.map(({ stack }) => stack)).toEqual([
      0,
      0,
      64,
      256,
      257,
      768,
    ]);
  });
});
