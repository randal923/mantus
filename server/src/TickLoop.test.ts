import { afterEach, describe, expect, it } from "vitest";
import { TickLoop } from "./TickLoop";

const twoEventLoopTurns = () =>
  new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));
const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("TickLoop", () => {
  const loops: TickLoop[] = [];

  const makeLoop = (
    intervalMs: number,
    onTick: () => void,
    minWakeSpacingMs?: number,
  ): TickLoop => {
    const loop = new TickLoop(intervalMs, onTick, minWakeSpacingMs);
    loops.push(loop);
    return loop;
  };

  afterEach(() => {
    for (const loop of loops.splice(0)) loop.stop();
  });

  it("runs a requested tick immediately instead of waiting the interval", async () => {
    let ticks = 0;
    const loop = makeLoop(10_000, () => {
      ticks += 1;
    });
    loop.start();
    loop.requestTick();
    await twoEventLoopTurns();
    expect(ticks).toBe(1);
  });

  it("coalesces wake requests made before the woken tick fires", async () => {
    let ticks = 0;
    const loop = makeLoop(10_000, () => {
      ticks += 1;
    });
    loop.start();
    loop.requestTick();
    loop.requestTick();
    loop.requestTick();
    await twoEventLoopTurns();
    expect(ticks).toBe(1);
  });

  it("ignores wake requests before start", async () => {
    let ticks = 0;
    const loop = makeLoop(10_000, () => {
      ticks += 1;
    });
    loop.requestTick();
    await twoEventLoopTurns();
    expect(ticks).toBe(0);
  });

  it("cancels a pending wake on stop", async () => {
    let ticks = 0;
    const loop = makeLoop(10_000, () => {
      ticks += 1;
    });
    loop.start();
    loop.requestTick();
    loop.stop();
    await twoEventLoopTurns();
    expect(ticks).toBe(0);
  });

  it("keeps a minimum spacing between woken ticks", async () => {
    let ticks = 0;
    const loop = makeLoop(10_000, () => {
      ticks += 1;
    }, 100);
    loop.start();
    loop.requestTick();
    await twoEventLoopTurns();
    expect(ticks).toBe(1);
    loop.requestTick();
    await sleep(30);
    expect(ticks).toBe(1);
    await sleep(120);
    expect(ticks).toBe(2);
  });

  it("still runs interval ticks without wake requests", async () => {
    let ticks = 0;
    const loop = makeLoop(20, () => {
      ticks += 1;
    });
    loop.start();
    await sleep(90);
    expect(ticks).toBeGreaterThanOrEqual(2);
  });

  it("wakeAll wakes running loops and skips stopped or unstarted ones", async () => {
    let runningTicks = 0;
    let stoppedTicks = 0;
    let unstartedTicks = 0;
    const running = makeLoop(10_000, () => {
      runningTicks += 1;
    });
    const stopped = makeLoop(10_000, () => {
      stoppedTicks += 1;
    });
    const unstarted = makeLoop(10_000, () => {
      unstartedTicks += 1;
    });
    running.start();
    stopped.start();
    stopped.stop();
    void unstarted;
    TickLoop.wakeAll();
    await twoEventLoopTurns();
    expect(runningTicks).toBe(1);
    expect(stoppedTicks).toBe(0);
    expect(unstartedTicks).toBe(0);
  });
});
