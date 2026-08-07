import { describe, expect, it } from "vitest";
import { WorldLightCycle } from "./WorldLightCycle";

const CHECK_MS = 10_000;

/** Runs the cycle check-by-check, collecting every broadcast light level. */
function run(cycle: WorldLightCycle, checks: number, startAt = 0): number[] {
  const levels: number[] = [];
  let now = startAt;
  cycle.tick(now);
  for (let index = 0; index < checks; index++) {
    now += CHECK_MS;
    const light = cycle.tick(now);
    if (light) levels.push(light.level);
  }
  return levels;
}

describe("WorldLightCycle", () => {
  it("starts at full daylight with the white palette color", () => {
    expect(new WorldLightCycle().current()).toEqual({ level: 250, color: 215 });
  });

  it("stays unchanged through the remaining day", () => {
    // Starts at minute 705; sunset begins near minute 1050, ~86 checks later.
    expect(run(new WorldLightCycle(), 80)).toEqual([]);
  });

  it("ramps down to night at sunset and back up at sunrise", () => {
    const cycle = new WorldLightCycle();
    const levels = run(cycle, 360);
    const nightIndex = levels.indexOf(40);
    expect(nightIndex).toBeGreaterThan(0);
    // Downward ramp in steps of 7, clamped at the night level.
    for (let index = 1; index <= nightIndex; index++) {
      const drop = levels[index - 1]! - levels[index]!;
      expect(drop).toBeGreaterThan(0);
      expect(drop).toBeLessThanOrEqual(7);
    }
    // A full game day passes in 360 checks, so dawn must have completed.
    expect(levels[levels.length - 1]).toBe(250);
    const dawn = levels.slice(nightIndex);
    expect(dawn.some((level) => level > 40 && level < 250)).toBe(true);
  });

  it("catches up missed checks in a single late tick", () => {
    const cycle = new WorldLightCycle();
    cycle.tick(0);
    // Jump straight past sunset: the one tick reports the settled level.
    const light = cycle.tick(200 * CHECK_MS);
    expect(light).not.toBeNull();
    expect(light!.level).toBe(40);
  });

  it("reports a forced dev level exactly once", () => {
    const cycle = new WorldLightCycle();
    cycle.tick(0);
    cycle.setLevel(40);
    expect(cycle.tick(1_000)).toEqual({ level: 40, color: 215 });
    expect(cycle.tick(2_000)).toBeNull();
  });
});
