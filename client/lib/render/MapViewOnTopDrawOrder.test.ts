import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { AssetStore, SpritePattern, TibiaObject } from "./AssetStore";
import { MapView } from "./MapView";

const flags = (overrides: Partial<TibiaObject["flags"]>): TibiaObject["flags"] => ({
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

const object = (clientId: number, isOnTop: boolean): TibiaObject => ({
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
  flags: flags(isOnTop ? { onTop: true } : {}),
  sprites: [clientId],
});

const ARCHWAY_TOP = 100; // onTop piece
const CRATE = 200; // common item

const stubStore = (): AssetStore =>
  ({
    item: (id: number) => object(id, id === ARCHWAY_TOP),
    spriteId: (_o: TibiaObject, _p: SpritePattern) => 1,
    spriteTexture: (_id: number) => Texture.WHITE,
    preload: async () => {},
  }) as unknown as AssetStore;

describe("MapView effect/missile vs onTop draw order", () => {
  it("draws onTop pieces above the effect layer and common items below it", async () => {
    const mapView = new MapView(stubStore());
    const position = { x: 10, y: 10, z: 7 };
    // Open the render window on this tile so the optimistic additions draw.
    mapView.setCenter(position.x, position.y, position.z);

    await mapView.previewMapItemAddition(position, {
      instanceId: "archway",
      itemId: ARCHWAY_TOP,
      revision: 1,
      count: 1,
    });
    await mapView.previewMapItemAddition(position, {
      instanceId: "crate",
      itemId: CRATE,
      revision: 1,
      count: 1,
    });

    // A missile/effect lives in the transient effect layer.
    const effectLayer = mapView.effectLayer(position.z);
    effectLayer.addChild(new Sprite(Texture.WHITE));

    const floorContainer = effectLayer.parent;
    if (!floorContainer) throw new Error("effect layer has no floor container");
    const children = floorContainer.children as Container[];
    const effectIndex = children.indexOf(effectLayer);
    const objectsLayer = children[effectIndex - 1];
    const onTopLayer = children[effectIndex + 1];
    if (!objectsLayer || !onTopLayer) {
      throw new Error("missing objects/onTop layers around the effect layer");
    }

    // The onTop overlay is drawn after the effect layer (occludes missiles),
    // the common-items layer before it (missiles pass over crates).
    expect(children.indexOf(onTopLayer)).toBeGreaterThan(effectIndex);
    expect(children.indexOf(objectsLayer)).toBeLessThan(effectIndex);

    // The archway top rendered into the overlay; the crate into objects.
    expect(onTopLayer.children.length).toBe(1);
    expect(objectsLayer.children.length).toBe(1);
    expect(onTopLayer.children[0]).toBeInstanceOf(Sprite);
  });
});
