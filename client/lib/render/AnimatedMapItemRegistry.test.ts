import { describe, expect, it, vi } from "vitest";
import { AnimatedMapItemRegistry } from "./AnimatedMapItemRegistry";
import type { TibiaAnimation } from "./AssetStore";
import { createRenderTestObject } from "./createRenderTestObject";

function animated(
  phases: number,
  overrides: Partial<Omit<TibiaAnimation, "phases">> = {},
  durationMs = 100,
) {
  return createRenderTestObject({
    clientId: 600 + phases,
    phases,
    sprites: Array.from({ length: phases }, (_, index) => index + 1),
    animation: {
      source: "appearances",
      timingMode: "asynchronous",
      loopType: "infinite",
      loopCount: 0,
      startPhase: 0,
      ...overrides,
      phases: Array.from({ length: phases }, () => ({
        minimumDurationMs: durationMs,
        maximumDurationMs: durationMs,
      })),
    },
  });
}

const brazier = animated(3);
const water = animated(4, { timingMode: "synchronized" }, 200);
const platform = animated(3, { loopType: "counted", loopCount: 1 });

describe("AnimatedMapItemRegistry", () => {
  it("updates existing visible sprites only when their phase changes", () => {
    const registry = new AnimatedMapItemRegistry();
    const applyPhase = vi.fn();
    registry.setVisibleFloors([7]);
    registry.register({
      id: "brazier",
      floor: 7,
      appearance: brazier,
      instanceSeed: 1,
      applyPhase,
    });
    expect(applyPhase).toHaveBeenLastCalledWith(0);

    registry.tick(99);
    expect(applyPhase).toHaveBeenCalledTimes(1);
    registry.tick(1);
    expect(applyPhase).toHaveBeenLastCalledWith(1);
    expect(applyPhase).toHaveBeenCalledTimes(2);
  });

  it("starts an asynchronous animation when the item appears, however late", () => {
    const registry = new AnimatedMapItemRegistry();
    registry.setVisibleFloors([7]);
    registry.tick(60_000);
    const applyPhase = vi.fn();
    registry.register({
      id: "late",
      floor: 7,
      appearance: brazier,
      instanceSeed: 2,
      applyPhase,
    });
    expect(applyPhase).toHaveBeenLastCalledWith(0);
    registry.tick(100);
    expect(applyPhase).toHaveBeenLastCalledWith(1);
  });

  it("plays a play-once animation registered long after the map loaded", () => {
    const registry = new AnimatedMapItemRegistry();
    registry.setVisibleFloors([7]);
    registry.tick(60_000);
    const phases: number[] = [];
    registry.register({
      id: "platform",
      floor: 7,
      appearance: platform,
      instanceSeed: 3,
      applyPhase: (phase) => phases.push(phase),
    });
    for (let step = 0; step < 6; step++) registry.tick(100);
    // Every phase in order, then held on the last — not frozen mid-rise.
    expect(phases).toEqual([0, 1, 2]);
  });

  it("keeps an animation running when its tile is redrawn", () => {
    const registry = new AnimatedMapItemRegistry();
    registry.setVisibleFloors([7]);
    registry.register({
      id: "brazier",
      floor: 7,
      appearance: brazier,
      instanceSeed: 4,
      applyPhase: () => undefined,
    });
    registry.tick(100);
    registry.tick(100);

    // A dropped coin redraws the tile: unregister, then register again.
    registry.unregister("brazier");
    const applyPhase = vi.fn();
    registry.register({
      id: "brazier",
      floor: 7,
      appearance: brazier,
      instanceSeed: 4,
      applyPhase,
    });
    expect(applyPhase).toHaveBeenLastCalledWith(2);
  });

  it("keeps a spent play-once animation on its last phase across a redraw", () => {
    const registry = new AnimatedMapItemRegistry();
    registry.setVisibleFloors([7]);
    registry.register({
      id: "platform",
      floor: 7,
      appearance: platform,
      instanceSeed: 10,
      applyPhase: () => undefined,
    });
    for (let step = 0; step < 5; step++) registry.tick(100);

    registry.unregister("platform");
    const applyPhase = vi.fn();
    registry.register({
      id: "platform",
      floor: 7,
      appearance: platform,
      instanceSeed: 10,
      applyPhase,
    });
    expect(applyPhase).toHaveBeenLastCalledWith(2);
    registry.tick(500);
    expect(applyPhase).toHaveBeenCalledTimes(1);
  });

  it("restarts an animation that was gone longer than the retain window", () => {
    const registry = new AnimatedMapItemRegistry();
    registry.setVisibleFloors([7]);
    registry.register({
      id: "brazier",
      floor: 7,
      appearance: brazier,
      instanceSeed: 5,
      applyPhase: () => undefined,
    });
    registry.tick(100);
    registry.unregister("brazier");
    registry.tick(20_000);
    const applyPhase = vi.fn();
    registry.register({
      id: "brazier",
      floor: 7,
      appearance: brazier,
      instanceSeed: 5,
      applyPhase,
    });
    expect(applyPhase).toHaveBeenLastCalledWith(0);
  });

  it("draws every synchronized instance on the same phase", () => {
    const registry = new AnimatedMapItemRegistry();
    registry.setVisibleFloors([7]);
    const first: number[] = [];
    registry.register({
      id: "water:1",
      floor: 7,
      appearance: water,
      instanceSeed: 6,
      applyPhase: (phase) => first.push(phase),
    });
    registry.tick(500);
    const second: number[] = [];
    registry.register({
      id: "water:2",
      floor: 7,
      appearance: water,
      instanceSeed: 7,
      applyPhase: (phase) => second.push(phase),
    });
    expect(second.at(-1)).toBe(first.at(-1));
    for (let step = 0; step < 6; step++) registry.tick(100);
    expect(second.at(-1)).toBe(first.at(-1));
  });

  it("resolves a synchronized phase again when its floor is revealed", () => {
    const registry = new AnimatedMapItemRegistry();
    registry.setVisibleFloors([7]);
    const applyPhase = vi.fn();
    registry.register({
      id: "water",
      floor: 6,
      appearance: water,
      instanceSeed: 8,
      applyPhase,
    });
    registry.tick(600);
    expect(applyPhase).toHaveBeenCalledTimes(1);
    registry.setVisibleFloors([6, 7]);
    expect(applyPhase).toHaveBeenLastCalledWith(3);
  });

  it("deregisters unloaded regions and performs no further ticker work", () => {
    const registry = new AnimatedMapItemRegistry();
    const applyPhase = vi.fn();
    registry.setVisibleFloors([7]);
    registry.register({
      id: "region-item",
      floor: 7,
      appearance: brazier,
      instanceSeed: 9,
      applyPhase,
    });
    registry.unregister("region-item");
    registry.tick(500);

    expect(registry.size).toBe(0);
    expect(applyPhase).toHaveBeenCalledTimes(1);
  });

  it("bounds dense-region work to registered items on visible floors", () => {
    const registry = new AnimatedMapItemRegistry();
    const visibleCallbacks = Array.from({ length: 64 }, () => vi.fn());
    const hiddenCallbacks = Array.from({ length: 512 }, () => vi.fn());
    for (const [index, applyPhase] of visibleCallbacks.entries()) {
      registry.register({
        id: `visible:${index}`,
        floor: 7,
        appearance: brazier,
        instanceSeed: index,
        applyPhase,
      });
    }
    for (const [index, applyPhase] of hiddenCallbacks.entries()) {
      registry.register({
        id: `hidden:${index}`,
        floor: 6,
        appearance: brazier,
        instanceSeed: index,
        applyPhase,
      });
    }
    registry.setVisibleFloors([7]);
    visibleCallbacks.forEach((callback) => callback.mockClear());
    hiddenCallbacks.forEach((callback) => callback.mockClear());
    registry.tick(100);

    expect(registry.activeSize).toBe(64);
    expect(visibleCallbacks.every((callback) => callback.mock.calls.length === 1)).toBe(true);
    expect(hiddenCallbacks.every((callback) => callback.mock.calls.length === 0)).toBe(true);
  });
});
