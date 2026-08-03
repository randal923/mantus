import { Texture } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatureState } from "@tibia/protocol";
import type { AssetStore, TibiaObject } from "./AssetStore";
import type { CreatureView } from "./CreatureView";
import { WorldRenderer } from "./WorldRenderer";

const preload = vi.hoisted(() => vi.fn<(ids: Iterable<number>) => Promise<void>>());

const outfitObject: TibiaObject = {
  category: "outfit",
  clientId: 138,
  width: 1,
  height: 1,
  layers: 1,
  px: 4,
  py: 1,
  pz: 1,
  phases: 1,
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
  sprites: [1],
};

vi.mock("./getSharedAssetStore", () => ({
  getSharedAssetStore: (): AssetStore =>
    ({
      outfitPalette: [],
      outfit: () => outfitObject,
      preload,
      cachedFrameTexture: () => Texture.EMPTY,
      cachedOutfitFrameTexture: () => Texture.EMPTY,
    }) as unknown as AssetStore,
}));

const npc: CreatureState = {
  kind: "npc",
  id: "npc-instance:asima:0",
  name: "Asima",
  position: { x: 33220, y: 32403, z: 7 },
  positionRevision: 0,
  direction: "south",
  healthPercent: 100,
  outfit: { lookType: 138, head: 59, body: 70, legs: 93, feet: 76, addons: 0 },
};

const viewsOf = (renderer: WorldRenderer) =>
  (renderer as unknown as { creatureViews: Map<string, CreatureView> })
    .creatureViews;

describe("WorldRenderer creature load retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    preload.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps a creature pending and renders it once its atlas load recovers", async () => {
    preload.mockRejectedValue(new Error("failed to load /assets/atlas-7.png"));
    const renderer = new WorldRenderer();

    renderer.applyMessage({ type: "creature-joined", creature: npc });
    await vi.advanceTimersByTimeAsync(0);
    expect(viewsOf(renderer).has(npc.id)).toBe(false);

    // The atlas host is reachable again by the first retry.
    preload.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(viewsOf(renderer).has(npc.id)).toBe(true);
  });

  it("retries with growing delays while the load keeps failing", async () => {
    preload.mockRejectedValue(new Error("failed to load /assets/atlas-7.png"));
    const renderer = new WorldRenderer();

    renderer.applyMessage({ type: "creature-joined", creature: npc });
    await vi.advanceTimersByTimeAsync(0);
    expect(preload).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(preload).toHaveBeenCalledTimes(2);

    // The next retry is scheduled at 4s, so nothing fires at 2s again.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(preload).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(preload).toHaveBeenCalledTimes(3);
  });

  it("stops retrying when the creature leaves view", async () => {
    preload.mockRejectedValue(new Error("failed to load /assets/atlas-7.png"));
    const renderer = new WorldRenderer();

    renderer.applyMessage({ type: "creature-joined", creature: npc });
    await vi.advanceTimersByTimeAsync(0);
    renderer.applyMessage({ type: "creature-left", creatureId: npc.id });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(preload).toHaveBeenCalledTimes(1);
  });

  it("stops retrying on destroy", async () => {
    preload.mockRejectedValue(new Error("failed to load /assets/atlas-7.png"));
    const renderer = new WorldRenderer();

    renderer.applyMessage({ type: "creature-joined", creature: npc });
    await vi.advanceTimersByTimeAsync(0);
    try {
      renderer.destroy();
    } catch {
      // The uninitialized Pixi app throws during listener teardown in the
      // node test environment; retry timers are cleared before that point.
    }

    await vi.advanceTimersByTimeAsync(120_000);
    expect(preload).toHaveBeenCalledTimes(1);
  });
});
