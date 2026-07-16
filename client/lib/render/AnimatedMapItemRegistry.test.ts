import { describe, expect, it, vi } from "vitest";
import { AnimatedMapItemRegistry } from "./AnimatedMapItemRegistry";
import { createRenderTestObject } from "./createRenderTestObject";

const water = createRenderTestObject({ phases: 3, sprites: [1, 2, 3] });

describe("AnimatedMapItemRegistry", () => {
  it("updates existing visible sprites only when their phase changes", () => {
    const registry = new AnimatedMapItemRegistry();
    const applyPhase = vi.fn();
    registry.setVisibleFloors([7]);
    registry.register({
      id: "water",
      floor: 7,
      appearance: water,
      instanceSeed: 0,
      applyPhase,
    });
    expect(applyPhase).toHaveBeenLastCalledWith(0);

    registry.tick(499);
    expect(applyPhase).toHaveBeenCalledTimes(1);
    registry.tick(1);
    expect(applyPhase).toHaveBeenLastCalledWith(1);
    expect(applyPhase).toHaveBeenCalledTimes(2);
  });

  it("deregisters unloaded regions and performs no further ticker work", () => {
    const registry = new AnimatedMapItemRegistry();
    const applyPhase = vi.fn();
    registry.setVisibleFloors([7]);
    registry.register({
      id: "region-item",
      floor: 7,
      appearance: water,
      instanceSeed: 0,
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
        appearance: water,
        instanceSeed: 0,
        applyPhase,
      });
    }
    for (const [index, applyPhase] of hiddenCallbacks.entries()) {
      registry.register({
        id: `hidden:${index}`,
        floor: 6,
        appearance: water,
        instanceSeed: 0,
        applyPhase,
      });
    }
    registry.setVisibleFloors([7]);
    visibleCallbacks.forEach((callback) => callback.mockClear());
    hiddenCallbacks.forEach((callback) => callback.mockClear());
    registry.tick(500);

    expect(registry.activeSize).toBe(64);
    expect(visibleCallbacks.every((callback) => callback.mock.calls.length === 1)).toBe(true);
    expect(hiddenCallbacks.every((callback) => callback.mock.calls.length === 0)).toBe(true);
  });
});
