import { describe, expect, it, vi } from "vitest";
import type { SessionRegistry } from "../SessionRegistry";
import { MemoryModerationStore } from "./MemoryModerationStore";
import { ModerationService } from "./ModerationService";
import type { ModerationPruneResult, ModerationStore } from "./ModerationStore";

const TARGET = "00000000-0000-4000-8000-00000000000b";
const DAY_MS = 24 * 3600 * 1000;
const EMPTY_REGISTRY = {
  all: () => [].values(),
  sessionFor: () => undefined,
} as unknown as SessionRegistry;

describe("moderation retention", () => {
  it("prunes only metadata past the retention cutoff", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new MemoryModerationStore();
    store.registerCharacter(TARGET, "Target", "acc-target");
    await store.muteCharacter({
      actorCharacterId: TARGET,
      targetName: "Target",
      durationMs: 60_000,
      reason: "spam",
    });
    // Cutoff before the mute expires: still enforcing, so it survives.
    expect(await store.pruneRetention(new Date(0), 500)).toMatchObject({
      mutes: 0,
    });
    expect(await store.loadMute(TARGET)).not.toBeNull();
    // Cutoff past its expiry: no longer enforcing anything, so it goes.
    const result = await store.pruneRetention(
      new Date(Date.now() + DAY_MS),
      500,
    );
    expect(result.mutes).toBe(1);
    expect(await store.loadMute(TARGET)).toBeNull();
  });

  it("runs one bounded pass per scan interval and never overlaps", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls: Array<{ before: Date; limit: number }> = [];
    let resolvePrune: (value: ModerationPruneResult) => void = () => {};
    const store = {
      pruneRetention: (before: Date, limit: number) => {
        calls.push({ before, limit });
        return new Promise<ModerationPruneResult>((resolve) => {
          resolvePrune = resolve;
        });
      },
    } as unknown as ModerationStore;
    const service = new ModerationService(EMPTY_REGISTRY, store, 30);
    const now = 400 * DAY_MS;
    service.tick(now);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.before.getTime()).toBe(now - 30 * DAY_MS);
    expect(calls[0]?.limit).toBeGreaterThan(0);
    // A second tick inside the interval, and one while the pass is still in
    // flight, must not start another scan.
    service.tick(now + 1_000);
    expect(calls).toHaveLength(1);
    resolvePrune({ mutes: 0, bans: 0, reports: 0, actions: 0 });
    await service.stop();
    service.tick(now + 2 * 60 * 60_000);
    expect(calls).toHaveLength(2);
    resolvePrune({ mutes: 0, bans: 0, reports: 0, actions: 0 });
    await service.stop();
  });

  it("does nothing without a store", () => {
    const service = new ModerationService(EMPTY_REGISTRY);
    expect(() => service.tick(0)).not.toThrow();
  });
});
