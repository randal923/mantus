import { afterEach, describe, expect, it } from "vitest";
import { ResolvedOutcomes } from "./ResolvedOutcomes";
import { TickLoop } from "./TickLoop";

const twoEventLoopTurns = () =>
  new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));

describe("ResolvedOutcomes", () => {
  const loops: TickLoop[] = [];

  afterEach(() => {
    for (const loop of loops.splice(0)) loop.stop();
  });

  it("applies outcomes in push order with the drain arguments", () => {
    const queue = new ResolvedOutcomes<[number]>();
    const applied: Array<[string, number]> = [];
    queue.push((now) => applied.push(["first", now]));
    queue.push((now) => applied.push(["second", now]));
    queue.applyAll(7);
    expect(applied).toEqual([
      ["first", 7],
      ["second", 7],
    ]);
    queue.applyAll(8);
    expect(applied).toHaveLength(2);
  });

  it("holds an outcome pushed during a drain for the next one", () => {
    const queue = new ResolvedOutcomes();
    const applied: string[] = [];
    queue.push(() => {
      applied.push("first");
      queue.push(() => applied.push("late"));
    });
    queue.applyAll();
    expect(applied).toEqual(["first"]);
    queue.applyAll();
    expect(applied).toEqual(["first", "late"]);
  });

  it("wakes a running tick loop instead of waiting out the interval", async () => {
    let ticks = 0;
    const loop = new TickLoop(10_000, () => {
      ticks += 1;
    });
    loops.push(loop);
    loop.start();
    const queue = new ResolvedOutcomes();
    queue.push(() => undefined);
    await twoEventLoopTurns();
    expect(ticks).toBe(1);
  });

  it("does not tick a loop that is not running", async () => {
    let ticks = 0;
    const loop = new TickLoop(10_000, () => {
      ticks += 1;
    });
    loops.push(loop);
    const queue = new ResolvedOutcomes();
    queue.push(() => undefined);
    await twoEventLoopTurns();
    expect(ticks).toBe(0);
  });
});
