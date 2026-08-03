import { describe, expect, it } from "vitest";
import type { CooldownStore, PersistedCooldown } from "./CooldownStore";
import { CooldownTracker } from "./CooldownTracker";
import { MemoryCooldownStore } from "./MemoryCooldownStore";

describe("CooldownTracker", () => {
  it("orders a login read behind the pending logout write", async () => {
    let releaseReplace: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseReplace = resolve;
    });
    const backing = new MemoryCooldownStore();
    const store: CooldownStore = {
      load: (characterId) => backing.load(characterId),
      replace: async (characterId, cooldowns) => {
        await gate;
        await backing.replace(characterId, cooldowns);
      },
    };
    const tracker = new CooldownTracker(store);
    const rows: PersistedCooldown[] = [
      { key: "spell:uteta-res-eq", readyAt: 9_000_000, totalMs: 7_200_000 },
    ];

    tracker.flush("character-1", rows);
    const read = tracker.load("character-1");
    releaseReplace();

    expect(await read).toEqual(rows);
    await tracker.stop();
  });

  it("replaces the whole set, so an empty flush erases old rows", async () => {
    const backing = new MemoryCooldownStore();
    const tracker = new CooldownTracker(backing);

    tracker.flush("character-1", [
      { key: "group:attack", readyAt: 5_000, totalMs: 2_000 },
    ]);
    tracker.flush("character-1", []);
    await tracker.stop();

    expect(await tracker.load("character-1")).toEqual([]);
  });

  it("is a no-op without a store", async () => {
    const tracker = new CooldownTracker();

    tracker.flush("character-1", [
      { key: "spell:exura", readyAt: 5_000, totalMs: 1_000 },
    ]);

    expect(await tracker.load("character-1")).toEqual([]);
    await tracker.stop();
  });
});
