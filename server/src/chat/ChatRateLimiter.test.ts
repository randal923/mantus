import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatFloodLimits } from "./ChatFloodLimits";
import { ChatFloodMetrics } from "./ChatFloodMetrics";
import { ChatRateLimiter } from "./ChatRateLimiter";

const LIMITS: ChatFloodLimits = {
  bufferCapacity: 4,
  bufferDrainMs: 1_500,
  muteBaseMs: 5_000,
  escalationDecayMs: 600_000,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChatRateLimiter", () => {
  it("mutes only once the configured buffer overflows", () => {
    const limiter = new ChatRateLimiter(LIMITS);
    for (let line = 0; line < LIMITS.bufferCapacity; line++) {
      expect(limiter.consume("a", 0)).toBe(0);
    }
    expect(limiter.consume("a", 0)).toBe(LIMITS.muteBaseMs);
  });

  it("respects a config-driven buffer capacity", () => {
    const limiter = new ChatRateLimiter({ ...LIMITS, bufferCapacity: 1 });
    expect(limiter.consume("a", 0)).toBe(0);
    expect(limiter.consume("a", 0)).toBeGreaterThan(0);
  });

  it("escalates mutes quadratically and keeps the counter across relogs", () => {
    const limiter = new ChatRateLimiter(LIMITS);
    const flood = (at: number) => {
      let muted = 0;
      for (let line = 0; line <= LIMITS.bufferCapacity; line++) {
        muted = limiter.consume("a", at);
      }
      return muted;
    };
    expect(flood(0)).toBe(5_000);
    // The limiter is keyed by character id and never told about sessions,
    // so a relog cannot reset the escalation counter.
    expect(flood(10_000)).toBe(20_000);
    expect(flood(60_000)).toBe(45_000);
  });

  it("forgives one escalation level per quiet decay window", () => {
    const metrics = new ChatFloodMetrics();
    const limiter = new ChatRateLimiter(LIMITS, metrics);
    for (let line = 0; line <= LIMITS.bufferCapacity; line++) {
      limiter.consume("a", 0);
    }
    for (let line = 0; line <= LIMITS.bufferCapacity; line++) {
      limiter.consume("a", 10_000);
    }
    // Two offences: the next would be level 3 (45 s) without decay.
    const quiet = 10_000 + LIMITS.escalationDecayMs;
    let muted = 0;
    for (let line = 0; line <= LIMITS.bufferCapacity; line++) {
      muted = limiter.consume("a", quiet);
    }
    expect(muted).toBe(20_000);
    expect(metrics.snapshot().escalationsDecayed).toBe(1);
  });

  it("does not let a long absence wipe more levels than it earned", () => {
    const limiter = new ChatRateLimiter(LIMITS);
    for (let offence = 0; offence < 3; offence++) {
      for (let line = 0; line <= LIMITS.bufferCapacity; line++) {
        limiter.consume("a", offence * 100_000);
      }
    }
    const quiet = 200_000 + LIMITS.escalationDecayMs * 2;
    let muted = 0;
    for (let line = 0; line <= LIMITS.bufferCapacity; line++) {
      muted = limiter.consume("a", quiet);
    }
    // Three offences, two windows forgiven, so this is the second offence.
    expect(muted).toBe(20_000);
  });

  it("counts accepted lines, drops, and mutes without any message content", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const metrics = new ChatFloodMetrics();
    const limiter = new ChatRateLimiter(LIMITS, metrics);
    for (let line = 0; line <= LIMITS.bufferCapacity; line++) {
      limiter.consume("char-1", 0);
    }
    limiter.consume("char-1", 10);
    limiter.consume("char-1", 20);
    const snapshot = metrics.snapshot();
    expect(snapshot.accepted).toBe(LIMITS.bufferCapacity);
    expect(snapshot.dropped).toBe(2);
    expect(snapshot.mutesIssued).toBe(1);
    expect(snapshot.mutesByLevel[0]).toBe(1);
    expect(snapshot.mutedMsTotal).toBe(5_000);
    // The limiter is never handed a message body, and the log line carries
    // only moderation metadata.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe(
      "chat flood mute: character=char-1 level=1 durationMs=5000",
    );
  });

  it("keeps per-character state independent", () => {
    const limiter = new ChatRateLimiter(LIMITS);
    for (let line = 0; line <= LIMITS.bufferCapacity; line++) {
      limiter.consume("a", 0);
    }
    expect(limiter.consume("b", 0)).toBe(0);
  });
});
