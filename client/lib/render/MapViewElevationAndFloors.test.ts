import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { AssetStore, SpritePattern, TibiaObject } from "./AssetStore";
import { MapView } from "./MapView";

const flags = (
  overrides: Partial<TibiaObject["flags"]>,
): TibiaObject["flags"] => ({
  ground: false,
  groundSpeed: 0,
  groundBorder: false,
  fullGround: false,
  notWalkable: false,
  blockProjectile: false,
  notMoveable: false,
  notPathable: false,
  onBottom: false,
  onTop: false,
  stackable: false,
  fluidContainer: false,
  splash: false,
  hangable: false,
  hookSouth: false,
  hookEast: false,
  dontHide: false,
  displacementX: 0,
  displacementY: 0,
  elevation: 0,
  lyingCorpse: false,
  animateAlways: false,
  topEffect: false,
  lightIntensity: 0,
  lightColor: 0,
  ...overrides,
});

const PARCEL = 300; // carries elevation like a stack of parcels

const object = (clientId: number): TibiaObject => ({
  category: "item",
  clientId,
  width: 1,
  height: 1,
  layers: 1,
  px: 0,
  py: 0,
  pz: 0,
  phases: 1,
  animation: null,
  flags: flags(clientId === PARCEL ? { elevation: 8 } : {}),
  sprites: [clientId],
});

const stubStore = (): AssetStore =>
  ({
    item: (id: number) => object(id),
    spriteId: (_o: TibiaObject, _p: SpritePattern) => 1,
    spriteTexture: (_id: number) => Texture.WHITE,
    preload: async () => {},
  }) as unknown as AssetStore;

describe("MapView floor visibility", () => {
  it("tracks the visible floor window across floor transitions", () => {
    const mapView = new MapView(stubStore());
    mapView.setCenter(10, 10, 7);
    expect(mapView.isDynamicFloorVisible(7)).toBe(true);
    expect(mapView.isDynamicFloorVisible(8)).toBe(false);

    mapView.setCenter(10, 10, 8);
    expect(mapView.isDynamicFloorVisible(8)).toBe(true);
    expect(mapView.isDynamicFloorVisible(10)).toBe(true);
    expect(mapView.isDynamicFloorVisible(7)).toBe(false);
    expect(mapView.isDynamicFloorVisible(11)).toBe(false);

    mapView.setCenter(10, 10, 7);
    expect(mapView.isDynamicFloorVisible(7)).toBe(true);
    expect(mapView.isDynamicFloorVisible(8)).toBe(false);
  });
});

describe("MapView creature elevation", () => {
  it("reflects dynamic elevation items and their removal", async () => {
    const mapView = new MapView(stubStore());
    mapView.setCenter(10, 10, 7);

    await mapView.previewMapItemAddition(
      { x: 10, y: 10, z: 7 },
      { instanceId: "parcel", itemId: PARCEL, revision: 1, count: 1 },
    );
    expect(mapView.elevationAt(7, 10, 10)).toBe(8);
    // Interpolates toward the flat neighbouring tile mid-crossing.
    expect(mapView.elevationAt(7, 10.5, 10)).toBe(4);

    mapView.previewMapItemRemoval({ x: 10, y: 10, z: 7 }, "parcel");
    expect(mapView.elevationAt(7, 10, 10)).toBe(0);
    expect(mapView.elevationAt(7, 10.5, 10)).toBe(0);
  });
});
