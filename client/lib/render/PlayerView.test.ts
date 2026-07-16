import { Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { PlayerState } from "@tibia/protocol";
import type {
  AssetStore,
  SpritePattern,
  TibiaObject,
} from "./AssetStore";
import { PlayerView } from "./PlayerView";
import { TILE_SIZE } from "./tileSize";

const state: PlayerState = {
  id: "player",
  name: "Player",
  position: { x: 10, y: 10, z: 7 },
  positionRevision: 0,
  direction: "east",
  healthPercent: 100,
  outfit: {
    lookType: 128,
    head: 0,
    body: 0,
    legs: 0,
    feet: 0,
    addons: 0,
  },
};

const outfit: TibiaObject = {
  category: "outfit",
  clientId: 128,
  width: 1,
  height: 1,
  layers: 1,
  px: 4,
  py: 1,
  pz: 1,
  phases: 3,
  animation: null,
  flags: {
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
  },
  sprites: [],
};

const store = {
  frameTexture: () => Texture.EMPTY,
} as unknown as AssetStore;

const animationTextures = [new Texture(), new Texture(), new Texture()];
const animationStore = {
  frameTexture: (_outfit: TibiaObject, pattern: SpritePattern) =>
    animationTextures[pattern.phase ?? 0] ?? Texture.EMPTY,
} as unknown as AssetStore;

describe("PlayerView", () => {
  it("does not snap a current step when a turn correction confirms its tile", () => {
    const view = new PlayerView(
      store,
      outfit,
      state,
      { head: [0, 0, 0], body: [0, 0, 0], legs: [0, 0, 0], feet: [0, 0, 0] },
      0xffffff,
    );
    view.applyMove({ x: 11, y: 10, z: 7 }, "east", 1, 1_000);
    view.tick(250);
    const beforeCorrection = view.pixelPosition();

    view.applyCorrection({ x: 11, y: 10, z: 7 }, "north", 1);

    expect(view.pixelPosition()).toEqual(beforeCorrection);
    expect(view.pixelPosition().x).toBeLessThan(11 * TILE_SIZE);
    view.destroy();
  });

  it("still snaps to a newer authoritative correction", () => {
    const view = new PlayerView(
      store,
      outfit,
      state,
      { head: [0, 0, 0], body: [0, 0, 0], legs: [0, 0, 0], feet: [0, 0, 0] },
      0xffffff,
    );
    view.applyMove({ x: 11, y: 10, z: 7 }, "east", 1, 1_000);
    view.tick(250);

    view.applyCorrection({ x: 12, y: 10, z: 7 }, "east", 2);

    expect(view.pixelPosition()).toEqual({
      x: 12 * TILE_SIZE,
      y: 10 * TILE_SIZE,
    });
    view.destroy();
  });

  it("paces walk frames independently from pixels traveled", () => {
    const view = new PlayerView(
      animationStore,
      outfit,
      state,
      { head: [0, 0, 0], body: [0, 0, 0], legs: [0, 0, 0], feet: [0, 0, 0] },
      0xffffff,
    );
    const sprite = view.container.children[0];
    if (!(sprite instanceof Sprite)) throw new Error("expected player sprite");

    view.tick(205);
    view.applyMove({ x: 11, y: 10, z: 7 }, "east", 1, 100);
    view.tick(1);
    expect(sprite.texture).toBe(animationTextures[1]);

    view.tick(24);
    expect(view.pixelPosition().x).toBe(10.25 * TILE_SIZE);
    expect(sprite.texture).toBe(animationTextures[1]);

    view.tick(26);
    expect(sprite.texture).toBe(animationTextures[2]);
    view.destroy();
  });

  it("returns to the idle frame when a step finishes", () => {
    const view = new PlayerView(
      animationStore,
      outfit,
      state,
      { head: [0, 0, 0], body: [0, 0, 0], legs: [0, 0, 0], feet: [0, 0, 0] },
      0xffffff,
    );
    const sprite = view.container.children[0];
    if (!(sprite instanceof Sprite)) throw new Error("expected player sprite");

    view.tick(205);
    view.applyMove({ x: 11, y: 10, z: 7 }, "east", 1, 100);
    view.tick(100);

    expect(view.pixelPosition().x).toBe(11 * TILE_SIZE);
    expect(sprite.texture).toBe(animationTextures[0]);
    view.destroy();
  });

  it("snaps an authoritative floor transition without a wrong-floor walk frame", () => {
    const view = new PlayerView(
      animationStore,
      outfit,
      state,
      { head: [0, 0, 0], body: [0, 0, 0], legs: [0, 0, 0], feet: [0, 0, 0] },
      0xffffff,
    );
    view.applyMove({ x: 11, y: 10, z: 6 }, "east", 1, 1_000);

    expect(view.floor).toBe(6);
    expect(view.pixelPosition()).toEqual({ x: 11 * TILE_SIZE, y: 10 * TILE_SIZE });
    view.destroy();
  });

  it("anchors the outfit, health bar, and nameplate to one elevated position", () => {
    const view = new PlayerView(
      store,
      outfit,
      state,
      { head: [0, 0, 0], body: [0, 0, 0], legs: [0, 0, 0], feet: [0, 0, 0] },
      0xffffff,
    );

    expect(view.visualPosition(16)).toEqual({
      x: 10 * TILE_SIZE - 16,
      y: 10 * TILE_SIZE - 16,
    });
    expect(view.plate.children).toHaveLength(2);
    view.destroy();
  });
});
