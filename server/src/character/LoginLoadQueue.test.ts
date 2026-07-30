import { describe, expect, it } from "vitest";
import { LoginLoadQueue } from "./LoginLoadQueue";

/** A load whose completion the test controls, reporting live concurrency. */
function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (cause: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("LoginLoadQueue", () => {
  it("runs one load at a time for the same character", async () => {
    const queue = new LoginLoadQueue();
    let inFlight = 0;
    let peak = 0;
    const gates = [deferred(), deferred(), deferred()];
    const run = (gate: (typeof gates)[number]) =>
      queue.run("char-a", async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await gate.promise;
        inFlight -= 1;
        return "ok";
      });

    const results = gates.map(run);
    // All three are queued, but only the first has started.
    expect(inFlight).toBe(1);
    for (const gate of gates) gate.resolve();

    expect(await Promise.all(results)).toEqual(["ok", "ok", "ok"]);
    expect(peak).toBe(1);
  });

  it("does not serialize across characters", async () => {
    const queue = new LoginLoadQueue();
    let inFlight = 0;
    let peak = 0;
    const gates = [deferred(), deferred()];
    const run = (characterId: string, gate: (typeof gates)[number]) =>
      queue.run(characterId, async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await gate.promise;
        inFlight -= 1;
      });

    const a = run("char-a", gates[0]!);
    const b = run("char-b", gates[1]!);
    // Two different characters log in concurrently; neither waits on the other.
    expect(peak).toBe(2);
    gates[0]!.resolve();
    gates[1]!.resolve();
    await Promise.all([a, b]);
  });

  it("keeps running queued loads after one rejects", async () => {
    const queue = new LoginLoadQueue();
    const order: string[] = [];
    const failing = queue.run("char-a", async () => {
      order.push("first");
      throw new Error("load failed");
    });
    const following = queue.run("char-a", async () => {
      order.push("second");
      return "ok";
    });

    await expect(failing).rejects.toThrow("load failed");
    // A store that is briefly unavailable must not strand the rest of the
    // login behind it.
    expect(await following).toBe("ok");
    expect(order).toEqual(["first", "second"]);
  });

  it("starts a fresh chain once a character's loads have drained", async () => {
    const queue = new LoginLoadQueue();
    expect(await queue.run("char-a", async () => 1)).toBe(1);
    // Let the drained tail clear before relogging.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Relogging must not queue behind the previous session's settled chain.
    let started = false;
    const second = queue.run("char-a", async () => {
      started = true;
      return 2;
    });
    expect(started).toBe(true);
    expect(await second).toBe(2);
  });
});
