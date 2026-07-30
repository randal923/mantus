import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetStore, TibiaAnimation, TibiaObject } from "./AssetStore";
import { createRenderTestObject } from "./createRenderTestObject";
import { getSpriteIndex } from "./getSpriteIndex";

function animated(
  clientId: number,
  phases: number,
  sprites: number[],
  overrides: Partial<Omit<TibiaAnimation, "phases">> = {},
): TibiaObject {
  return createRenderTestObject({
    clientId,
    phases,
    sprites,
    animation: {
      source: "appearances",
      timingMode: "asynchronous",
      loopType: "infinite",
      loopCount: 0,
      startPhase: 0,
      ...overrides,
      phases: Array.from({ length: phases }, () => ({
        minimumDurationMs: 100,
        maximumDurationMs: 100,
      })),
    },
  });
}

/** Two potions sharing a first sprite: neither may resolve by sprite id. */
const POTION = animated(1_001, 3, [10, 11, 12]);
const TORCH = animated(1_002, 2, [20, 21], { timingMode: "synchronized" });
const AMBIGUOUS_A = animated(1_003, 2, [30, 31]);
const AMBIGUOUS_B = animated(1_004, 2, [30, 32]);
const STATIC = createRenderTestObject({ clientId: 1_005, sprites: [40] });
const CATALOG = [POTION, TORCH, AMBIGUOUS_A, AMBIGUOUS_B, STATIC];

const load = vi.fn(() => Promise.resolve());
vi.mock("./getSharedAssetStore", () => ({
  getSharedAssetStore: (): AssetStore =>
    ({
      load,
      item: (id: number) => {
        const found = CATALOG.find((object) => object.clientId === id);
        if (!found) throw new Error(`unknown item ${id}`);
        return found;
      },
      itemAppearances: () => CATALOG.values(),
      spriteId: (object: TibiaObject, pattern: Parameters<AssetStore["spriteId"]>[1]) =>
        object.sprites[getSpriteIndex(object, pattern)] ?? 0,
    }) as unknown as AssetStore,
}));

async function freshStore() {
  vi.resetModules();
  const loaded = await import("./itemIconAnimationStore");
  return loaded.itemIconAnimationStore;
}

describe("itemIconAnimationStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    load.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves an appearance and animates it once the catalog is loaded", async () => {
    const store = await freshStore();
    const notify = vi.fn();
    const stop = store.subscribe(POTION.clientId, 10, notify);
    expect(store.frame(POTION.clientId, 10).appearance).toBeNull();

    await vi.advanceTimersByTimeAsync(0);
    expect(store.frame(POTION.clientId, 10).appearance).toBe(POTION);
    expect(store.frame(POTION.clientId, 10).phase).toBe(0);
    expect(notify).toHaveBeenCalled();

    const before = store.revision();
    await vi.advanceTimersByTimeAsync(100);
    expect(store.frame(POTION.clientId, 10).phase).toBe(1);
    expect(store.revision()).toBeGreaterThan(before);
    stop();
  });

  it("shares one animation between every icon of the same item", async () => {
    const store = await freshStore();
    const stopFirst = store.subscribe(POTION.clientId, 10, () => undefined);
    await vi.advanceTimersByTimeAsync(250);
    const stopSecond = store.subscribe(POTION.clientId, 10, () => undefined);
    expect(store.frame(POTION.clientId, 10).phase).toBe(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.frame(POTION.clientId, 10).phase).toBe(0);
    stopFirst();
    stopSecond();
  });

  it("advances a synchronized item on the shared clock", async () => {
    const store = await freshStore();
    const stop = store.subscribe(TORCH.clientId, 20, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.frame(TORCH.clientId, 20).phase).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.frame(TORCH.clientId, 20).phase).toBe(1);
    stop();
  });

  it("resolves a bare sprite id only when it belongs to one appearance", async () => {
    const store = await freshStore();
    const stop = store.subscribe(undefined, 10, () => undefined);
    const ambiguous = store.subscribe(undefined, 30, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.frame(undefined, 10).appearance).toBe(POTION);
    expect(store.frame(undefined, 30).appearance).toBeNull();
    stop();
    ambiguous();
  });

  it("stops the clock when the last icon unmounts", async () => {
    const store = await freshStore();
    const stop = store.subscribe(POTION.clientId, 10, () => undefined);
    await vi.advanceTimersByTimeAsync(100);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    const frozen = store.frame(POTION.clientId, 10).phase;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.frame(POTION.clientId, 10).phase).toBe(frozen);
  });

  it("never animates an item with a single phase", async () => {
    const store = await freshStore();
    const notify = vi.fn();
    const stop = store.subscribe(STATIC.clientId, 40, notify);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(store.frame(STATIC.clientId, 40).phase).toBe(0);
    // One notification for the catalog load, none for animation.
    expect(notify).toHaveBeenCalledTimes(1);
    stop();
  });
});
