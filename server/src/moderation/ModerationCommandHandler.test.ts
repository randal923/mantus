import { describe, expect, it, vi } from "vitest";
import type { Player } from "../Player";
import type { Session } from "../Session";
import { ModerationCommandHandler } from "./ModerationCommandHandler";
import type { ModerationService } from "./ModerationService";

function makeHarness(isStaff: boolean) {
  const moderation = {
    gmMute: vi.fn(),
    gmUnmute: vi.fn(),
    gmKick: vi.fn(),
    gmBan: vi.fn(),
    gmUnban: vi.fn(),
    gmNote: vi.fn(),
  } as unknown as ModerationService;
  const sent: unknown[] = [];
  const session = {
    id: "session",
    playerId: "actor",
    account: { id: "acc", isStaff },
    send: (message: unknown) => sent.push(message),
  } as unknown as Session;
  const player = { id: "actor", name: "Operator" } as unknown as Player;
  return {
    moderation,
    session,
    player,
    sent,
    handler: new ModerationCommandHandler(moderation),
  };
}

describe("ModerationCommandHandler", () => {
  it("runs moderation actions for a staff session", () => {
    const harness = makeHarness(true);
    expect(
      harness.handler.tryHandle(
        harness.session,
        harness.player,
        "/mute Bob 5 spamming",
      ),
    ).toBe(true);
    expect(harness.moderation.gmMute).toHaveBeenCalledWith(
      harness.session,
      "actor",
      "Bob",
      5,
      "spamming",
    );

    expect(
      harness.handler.tryHandle(harness.session, harness.player, "/kick Bob"),
    ).toBe(true);
    expect(harness.moderation.gmKick).toHaveBeenCalledWith(
      harness.session,
      "actor",
      "Bob",
    );

    expect(
      harness.handler.tryHandle(
        harness.session,
        harness.player,
        "/ban Bob 3 cheating",
      ),
    ).toBe(true);
    expect(harness.moderation.gmBan).toHaveBeenCalledWith(
      harness.session,
      "actor",
      "Bob",
      3,
      "cheating",
    );
  });

  it("ignores the same lines from a non-staff session entirely", () => {
    const harness = makeHarness(false);
    for (const line of [
      "/mute Bob 5",
      "/kick Bob",
      "/ban Bob 3",
      "/unban Bob",
      "/note Bob suspicious",
    ]) {
      // Not consumed and not answered: the surface is not discoverable.
      expect(
        harness.handler.tryHandle(harness.session, harness.player, line),
      ).toBe(false);
    }
    expect(harness.sent).toEqual([]);
    expect(harness.moderation.gmMute).not.toHaveBeenCalled();
    expect(harness.moderation.gmBan).not.toHaveBeenCalled();
  });

  it("rejects malformed arguments without calling the service", () => {
    const harness = makeHarness(true);
    for (const line of [
      "/mute Bob",
      "/mute Bob 0",
      "/mute Bob 999999",
      "/ban Bob abc",
      "/note Bob",
      "/kick",
    ]) {
      expect(
        harness.handler.tryHandle(harness.session, harness.player, line),
      ).toBe(true);
    }
    expect(harness.moderation.gmMute).not.toHaveBeenCalled();
    expect(harness.moderation.gmBan).not.toHaveBeenCalled();
    expect(harness.moderation.gmNote).not.toHaveBeenCalled();
    expect(harness.moderation.gmKick).not.toHaveBeenCalled();
    expect(harness.sent).toHaveLength(6);
  });

  it("leaves ordinary speech and unknown commands alone", () => {
    const harness = makeHarness(true);
    for (const line of ["hello there", "/goto 1 2", "/coins 5"]) {
      expect(
        harness.handler.tryHandle(harness.session, harness.player, line),
      ).toBe(false);
    }
  });
});
