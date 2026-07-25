import { describe, expect, it, vi } from "vitest";
import type { AccountRole } from "../auth/AccountRole";
import type { Player } from "../Player";
import type { Session } from "../Session";
import { ModerationCommandHandler } from "./ModerationCommandHandler";
import type { ModerationService } from "./ModerationService";

function makeHarness(role: AccountRole) {
  const moderation = {
    gmMute: vi.fn(),
    gmUnmute: vi.fn(),
    gmKick: vi.fn(),
    gmBan: vi.fn(),
    gmUnban: vi.fn(),
    gmNote: vi.fn(),
    gmNamelock: vi.fn(),
  } as unknown as ModerationService;
  const sent: unknown[] = [];
  const session = {
    id: "session",
    playerId: "actor",
    account: { id: "acc", role, isStaff: role !== "player" },
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
  it("runs moderation actions for a gamemaster session", () => {
    const harness = makeHarness("gamemaster");
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

  it("ignores the same lines from a plain player session entirely", () => {
    const harness = makeHarness("player");
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
    const harness = makeHarness("gamemaster");
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
    const harness = makeHarness("gamemaster");
    for (const line of ["hello there", "/goto 1 2", "/coins 5"]) {
      expect(
        harness.handler.tryHandle(harness.session, harness.player, line),
      ).toBe(false);
    }
  });

  // Feature 96: the gate is per command, not per "is staff". A tutor calms
  // chat and records notes; removing anyone from the game needs a gamemaster.
  it("authorizes each command separately for a tutor", () => {
    const harness = makeHarness("tutor");
    expect(
      harness.handler.tryHandle(
        harness.session,
        harness.player,
        "/mute Bob 5 spamming",
      ),
    ).toBe(true);
    expect(harness.moderation.gmMute).toHaveBeenCalled();
    expect(
      harness.handler.tryHandle(
        harness.session,
        harness.player,
        "/note Bob suspicious",
      ),
    ).toBe(true);
    expect(harness.moderation.gmNote).toHaveBeenCalled();

    for (const line of [
      "/kick Bob",
      "/ban Bob 3 cheating",
      "/unban Bob",
      "/namelock Bob rude",
    ]) {
      // Silently not consumed: the tutor cannot learn where the boundary is.
      expect(
        harness.handler.tryHandle(harness.session, harness.player, line),
      ).toBe(false);
    }
    expect(harness.moderation.gmKick).not.toHaveBeenCalled();
    expect(harness.moderation.gmBan).not.toHaveBeenCalled();
    expect(harness.moderation.gmUnban).not.toHaveBeenCalled();
    expect(harness.moderation.gmNamelock).not.toHaveBeenCalled();
  });

  it("ignores a role the build does not know", () => {
    // Fail closed: a row written by a newer server (or by hand) authorizes
    // nothing rather than everything.
    const harness = makeHarness("archmage" as AccountRole);
    expect(
      harness.handler.tryHandle(harness.session, harness.player, "/ban Bob 3"),
    ).toBe(false);
    expect(harness.moderation.gmBan).not.toHaveBeenCalled();
  });

  it("ignores a session with no account at all", () => {
    const harness = makeHarness("gamemaster");
    const anonymous = { ...harness.session, account: null } as Session;
    expect(
      harness.handler.tryHandle(anonymous, harness.player, "/ban Bob 3"),
    ).toBe(false);
    expect(harness.moderation.gmBan).not.toHaveBeenCalled();
  });
});
