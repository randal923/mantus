import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { PlayerState } from "@tibia/protocol";
import type { AssetStore, TibiaObject } from "./AssetStore";
import { PlayerView } from "./PlayerView";

const state: PlayerState = {
  id: "player",
  name: "Player",
  position: { x: 10, y: 10, z: 7 },
  positionRevision: 0,
  direction: "east",
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
  phases: 2,
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
  },
  sprites: [],
};

const store = {
  frameTexture: () => Texture.EMPTY,
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
    expect(view.pixelPosition().x).toBeLessThan(11 * 32);
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

    expect(view.pixelPosition()).toEqual({ x: 12 * 32, y: 10 * 32 });
    view.destroy();
  });
});
