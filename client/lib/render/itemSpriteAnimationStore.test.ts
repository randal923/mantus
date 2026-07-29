import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ANIMATIONS_FILE = {
  formatVersion: 3,
  fallbackDurationMs: 100,
  animations: {
    // A consecutive run held for 200ms a frame, the way Tibia plays it.
    "28552": { b: 25_676, f: 5, d: 200 },
    // An explicit, non-consecutive sequence.
    "50100": { b: 50_455, f: [50_455, 50_454, 50_457], d: 100 },
    // A long idle frame, then a fast glint.
    "31000": { b: 31_000, f: 3, d: [1_000, 50, 50] },
    // Two appearances sharing a first sprite but not a sequence: a bare
    // sprite id must resolve to neither, a client id to its own.
    "40001": { b: 40_100, f: 4, d: 100 },
    "40002": { b: 40_100, f: [40_100, 40_200], d: 100 },
  },
};

async function importStore() {
  vi.resetModules();
  const loaded = await import("./itemSpriteAnimationStore");
  return loaded.itemSpriteAnimationStore;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ANIMATIONS_FILE })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("itemSpriteAnimationStore", () => {
  it("holds each frame for the duration Tibia gives it", async () => {
    const store = await importStore();
    const listener = vi.fn();
    const key = { clientId: 28_552, spriteId: 25_676 };
    store.subscribe(key, listener);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.currentSpriteId(key)).toBe(25_676);
    await vi.advanceTimersByTimeAsync(100);
    // Still the first frame: this item is not on the flat fallback rate.
    expect(store.currentSpriteId(key)).toBe(25_676);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.currentSpriteId(key)).toBe(25_677);
    await vi.advanceTimersByTimeAsync(800);
    // Five frames of 200ms, so the cycle is back on the first sprite.
    expect(store.currentSpriteId(key)).toBe(25_676);
    expect(listener).toHaveBeenCalled();
  });

  it("resolves a bare sprite id when it belongs to one schedule", async () => {
    const store = await importStore();
    const key = { spriteId: 25_676 };
    store.subscribe(key, vi.fn());
    await vi.advanceTimersByTimeAsync(200);

    expect(store.currentSpriteId(key)).toBe(25_677);
  });

  it("keeps a shared first sprite static unless a client id disambiguates", async () => {
    const store = await importStore();
    const bare = { spriteId: 40_100 };
    const exact = { clientId: 40_002, spriteId: 40_100 };
    const bareListener = vi.fn();
    store.subscribe(bare, bareListener);
    store.subscribe(exact, vi.fn());
    await vi.advanceTimersByTimeAsync(100);

    expect(store.currentSpriteId(bare)).toBe(40_100);
    expect(bareListener).not.toHaveBeenCalled();
    expect(store.currentSpriteId(exact)).toBe(40_200);
  });

  it("plays a per-phase schedule instead of one rate for the item", async () => {
    const store = await importStore();
    const key = { clientId: 31_000, spriteId: 31_000 };
    store.subscribe(key, vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    expect(store.currentSpriteId(key)).toBe(31_000);
    await vi.advanceTimersByTimeAsync(999);
    expect(store.currentSpriteId(key)).toBe(31_000);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.currentSpriteId(key)).toBe(31_001);
    await vi.advanceTimersByTimeAsync(50);
    expect(store.currentSpriteId(key)).toBe(31_002);
    await vi.advanceTimersByTimeAsync(50);
    expect(store.currentSpriteId(key)).toBe(31_000);
  });

  it("expands an explicit sequence in the order the DAT gives it", async () => {
    const store = await importStore();
    const key = { clientId: 50_100, spriteId: 50_455 };
    store.subscribe(key, vi.fn());
    await vi.advanceTimersByTimeAsync(100);

    expect(store.currentSpriteId(key)).toBe(50_454);
  });

  it("leaves an unanimated sprite alone and never wakes its icon", async () => {
    const store = await importStore();
    const listener = vi.fn();
    const key = { clientId: 3_031, spriteId: 4_358 };
    store.subscribe(key, listener);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(store.currentSpriteId(key)).toBe(4_358);
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps drawing the first frame when the table cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const store = await importStore();
    const key = { clientId: 28_552, spriteId: 25_676 };
    store.subscribe(key, vi.fn());
    await vi.advanceTimersByTimeAsync(5_000);

    expect(store.currentSpriteId(key)).toBe(25_676);
  });

  it("sleeps until the next frame boundary rather than polling", async () => {
    const store = await importStore();
    const listener = vi.fn();
    store.subscribe({ clientId: 31_000, spriteId: 31_000 }, listener);
    await vi.advanceTimersByTimeAsync(0);
    listener.mockClear();

    await vi.advanceTimersByTimeAsync(900);

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops the clock once the last animated icon unmounts", async () => {
    const store = await importStore();
    const unsubscribe = store.subscribe(
      { clientId: 28_552, spriteId: 25_676 },
      vi.fn(),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unsubscribe();

    expect(vi.getTimerCount()).toBe(0);
  });
});
