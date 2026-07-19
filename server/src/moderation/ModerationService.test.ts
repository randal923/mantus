import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { MemoryModerationStore } from "./MemoryModerationStore";
import { ModerationService } from "./ModerationService";

const REPORTER = "00000000-0000-4000-8000-00000000000a";
const TARGET = "00000000-0000-4000-8000-00000000000b";

interface Harness {
  readonly store: MemoryModerationStore;
  readonly service: ModerationService;
  readonly session: Session;
  readonly sent: ServerMessage[];
  flush(now?: number): Promise<void>;
}

function makeHarness(): Harness {
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const store = new MemoryModerationStore();
  store.registerCharacter(REPORTER, "Reporter", "acc-reporter");
  store.registerCharacter(TARGET, "Target", "acc-target");
  const service = new ModerationService(registry, store);
  const sent: ServerMessage[] = [];
  const session = {
    id: "session-reporter",
    playerId: REPORTER,
    send: (message: ServerMessage) => sent.push(message),
    sendError: () => {},
  } as unknown as Session;
  sessions.set(REPORTER, session);
  return {
    store,
    service,
    session,
    sent,
    async flush(now = 0) {
      await service.stop();
      service.applyResolvedOutcomes(now);
    },
  };
}

describe("ModerationService", () => {
  it("honors mute expiry: an expired mute speaks again", async () => {
    const harness = makeHarness();
    harness.service.gmMute(harness.session, REPORTER, "Target", 1, "spam");
    await harness.flush(0);
    const start = Date.now();
    expect(harness.service.muteRemainingMs(TARGET, start)).toBeGreaterThan(0);
    expect(harness.service.muteRemainingMs(TARGET, start + 61_000)).toBe(0);
    // Expiry is sticky: once expired the cache entry is dropped.
    expect(harness.service.muteRemainingMs(TARGET, start)).toBe(0);
  });

  it("merges auto-mutes across chat kinds and keeps the longest", () => {
    const harness = makeHarness();
    harness.service.noteAutoMute(TARGET, 10_000);
    harness.service.noteAutoMute(TARGET, 5_000);
    expect(harness.service.muteRemainingMs(TARGET, 4_000)).toBe(6_000);
    expect(harness.service.muteRemainingMs(TARGET, 10_001)).toBe(0);
  });

  it("loads durable mutes at login", async () => {
    const harness = makeHarness();
    await harness.store.muteCharacter({
      actorCharacterId: REPORTER,
      targetName: "Target",
      durationMs: 120_000,
      reason: "spam",
    });
    harness.service.attachCharacter(TARGET);
    await harness.flush(0);
    expect(harness.service.muteRemainingMs(TARGET, Date.now())).toBeGreaterThan(
      0,
    );
    harness.service.detachCharacter(TARGET);
    expect(harness.service.muteRemainingMs(TARGET, Date.now())).toBe(0);
  });

  it("enforces the one-report-per-minute session limit", async () => {
    const harness = makeHarness();
    const report = {
      type: "report-player",
      targetName: "Target",
      reason: "botting",
      comment: "afk aiming",
    } as const;
    harness.service.handleReport(harness.session, report, 1_000);
    await harness.flush(1_000);
    expect(harness.sent.at(-1)).toEqual({ type: "report-received" });

    harness.service.handleReport(harness.session, report, 30_000);
    expect(harness.sent.at(-1)).toEqual({
      type: "report-action-failed",
      reason: "rate-limited",
    });

    harness.service.handleReport(harness.session, report, 62_000);
    await harness.flush(62_000);
    expect(harness.sent.at(-1)).toEqual({ type: "report-received" });
    expect(harness.store.reports).toHaveLength(2);
  });

  it("enforces the per-character daily cap inside the store", async () => {
    const harness = makeHarness();
    for (let index = 0; index < 20; index += 1) {
      const result = await harness.store.createReport({
        reporterCharacterId: REPORTER,
        targetName: "Target",
        reason: "abuse",
        comment: "",
        maxPerDay: 20,
      });
      expect(result.status).toBe("created");
    }
    const overCap = await harness.store.createReport({
      reporterCharacterId: REPORTER,
      targetName: "Target",
      reason: "abuse",
      comment: "",
      maxPerDay: 20,
    });
    expect(overCap).toEqual({ status: "failed", reason: "rate-limited" });
    expect(harness.store.reports).toHaveLength(20);
  });

  it("rejects reports against unknown names without leaking details", async () => {
    const harness = makeHarness();
    harness.service.handleReport(
      harness.session,
      {
        type: "report-player",
        targetName: "Nobody",
        reason: "name",
        comment: "",
      },
      1_000,
    );
    await harness.flush(1_000);
    expect(harness.sent.at(-1)).toEqual({
      type: "report-action-failed",
      reason: "target-not-found",
    });
    expect(harness.store.reports).toHaveLength(0);
  });
});
