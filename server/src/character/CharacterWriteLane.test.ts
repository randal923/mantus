import { describe, expect, it } from "vitest";
import { CharacterWriteLane } from "./CharacterWriteLane";

const CHARACTER_A = "0f1c8a5e-2f4f-4a54-8f3e-2d5a1b0c9d11";
const CHARACTER_B = "8c1f2b73-9a4e-4d61-9b7c-0a3e6f5d4c22";

function deferred() {
  let resolve!: () => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("CharacterWriteLane", () => {
  it("never overlaps two writes to the same character", async () => {
    const lane = new CharacterWriteLane();
    const first = deferred();
    const running: string[] = [];

    const save = lane.run(CHARACTER_A, async () => {
      running.push("save:start");
      await first.promise;
      running.push("save:end");
    });
    const persist = lane.run(CHARACTER_A, async () => {
      running.push("persist:start");
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(running).toEqual(["save:start"]);

    first.resolve();
    await Promise.all([save, persist]);
    expect(running).toEqual(["save:start", "save:end", "persist:start"]);
  });

  it("runs different characters concurrently", async () => {
    const lane = new CharacterWriteLane();
    const blocked = deferred();
    const running: string[] = [];

    const held = lane.run(CHARACTER_A, async () => {
      running.push("a");
      await blocked.promise;
    });
    await lane.run(CHARACTER_B, async () => {
      running.push("b");
    });

    expect(running).toEqual(["a", "b"]);
    blocked.resolve();
    await held;
  });

  it("lets the next write run after one fails", async () => {
    const lane = new CharacterWriteLane();

    const failed = lane.run(CHARACTER_A, () =>
      Promise.reject(new Error("could not serialize access")),
    );
    await expect(failed).rejects.toThrow("could not serialize access");
    await expect(lane.run(CHARACTER_A, async () => "written")).resolves.toBe(
      "written",
    );
  });
});
