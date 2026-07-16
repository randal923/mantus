import { describe, expect, it } from "vitest";
import { createRenderTestObject } from "./createRenderTestObject";
import { getTileRenderLayers } from "./getTileRenderLayers";
import { MAP_DEPTH } from "./mapDepth";

describe("getTileRenderLayers", () => {
  it("matches the canonical ground-to-canopy stack fixture", () => {
    const fixture = [
      {
        instanceId: "ground",
        stackIndex: 0,
        object: { ...createRenderTestObject({ flags: { ground: true } }), label: "ground" },
      },
      {
        instanceId: "border",
        stackIndex: 1,
        object: {
          ...createRenderTestObject({ flags: { groundBorder: true } }),
          label: "border",
        },
      },
      {
        instanceId: "wall",
        stackIndex: 2,
        object: { ...createRenderTestObject({ flags: { onBottom: true } }), label: "wall" },
      },
      {
        instanceId: "parcel",
        stackIndex: 3,
        object: {
          ...createRenderTestObject({ flags: { elevation: 8 } }),
          label: "parcel",
        },
      },
      {
        instanceId: "decoration",
        stackIndex: 4,
        object: { ...createRenderTestObject(), label: "decoration" },
      },
      {
        instanceId: "canopy",
        stackIndex: 5,
        object: { ...createRenderTestObject({ flags: { onTop: true } }), label: "canopy" },
      },
    ];

    const layers = getTileRenderLayers(fixture);
    expect(
      [...layers.beforeCreature, ...layers.topItems].map(
        ({ object, layer, depth, elevationBefore }) => ({
          label: object.label,
          layer,
          depth,
          elevationBefore,
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "depth": 0,
          "elevationBefore": 0,
          "label": "ground",
          "layer": "ground",
        },
        {
          "depth": 64,
          "elevationBefore": 0,
          "label": "border",
          "layer": "ground-border",
        },
        {
          "depth": 192,
          "elevationBefore": 0,
          "label": "wall",
          "layer": "bottom-item",
        },
        {
          "depth": 384,
          "elevationBefore": 0,
          "label": "decoration",
          "layer": "common-item",
        },
        {
          "depth": 388,
          "elevationBefore": 0,
          "label": "parcel",
          "layer": "common-item",
        },
        {
          "depth": 896,
          "elevationBefore": 0,
          "label": "canopy",
          "layer": "top-item",
        },
      ]
    `);
    expect(layers.creatureElevation).toBe(8);
    expect(layers.commonItems.at(-1)?.depth).toBeLessThan(MAP_DEPTH.creature);
    expect(layers.topItems[0].depth).toBeGreaterThan(MAP_DEPTH.creature);
  });

  it("caps cumulative parcel elevation at the classic tile limit", () => {
    const parcels = Array.from({ length: 4 }, (_, stackIndex) => ({
      instanceId: `parcel:${stackIndex}`,
      stackIndex,
      object: createRenderTestObject({ flags: { elevation: 8 } }),
    }));
    const layers = getTileRenderLayers(parcels);

    expect(layers.commonItems.map(({ elevationBefore }) => elevationBefore)).toEqual([
      0,
      8,
      16,
      24,
    ]);
    expect(layers.creatureElevation).toBe(24);
  });
});
