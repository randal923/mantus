import { describe, expect, it } from "vitest";
import { createRenderTestObject } from "./createRenderTestObject";
import { getTileLimitsFloorView } from "./getTileLimitsFloorView";

const ground = createRenderTestObject({ flags: { ground: true } });
const border = createRenderTestObject({ flags: { groundBorder: true } });
const wall = createRenderTestObject({
  flags: { onBottom: true, blockProjectile: true },
});
const fence = createRenderTestObject({ flags: { onBottom: true } });

describe("getTileLimitsFloorView", () => {
  it("limits the view when the first thing is ground", () => {
    expect(getTileLimitsFloorView([ground, wall], false)).toBe(true);
    expect(getTileLimitsFloorView([ground], true)).toBe(true);
  });

  it("ignores walls behind a leading ground border, like OTClient", () => {
    expect(getTileLimitsFloorView([border, wall], true)).toBe(false);
    expect(getTileLimitsFloorView([border, wall], false)).toBe(false);
  });

  it("finds the first thing by stack priority, not array order", () => {
    expect(getTileLimitsFloorView([wall, ground], false)).toBe(true);
    expect(getTileLimitsFloorView([wall, border], false)).toBe(false);
  });

  it("requires projectile blocking for leading bottom items without free view", () => {
    expect(getTileLimitsFloorView([wall], false)).toBe(true);
    expect(getTileLimitsFloorView([fence], false)).toBe(false);
    expect(getTileLimitsFloorView([fence], true)).toBe(true);
  });

  it("never limits from empty or dont-hide tiles", () => {
    const hidden = createRenderTestObject({
      flags: { ground: true, dontHide: true },
    });
    expect(getTileLimitsFloorView([], true)).toBe(false);
    expect(getTileLimitsFloorView([hidden], true)).toBe(false);
  });
});
