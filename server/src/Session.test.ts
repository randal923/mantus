import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { Session } from "./Session";

describe("Session", () => {
  it("starts in Canary's offensive fight mode", () => {
    const socket = {
      on: vi.fn(),
    } as unknown as WebSocket;

    const session = new Session("session", "127.0.0.1", socket, {
      maxPendingIntents: 16,
      maxProtocolViolations: 5,
      initialViewRange: { x: 9, y: 7 },
    });

    expect(session.fightMode).toEqual({
      attack: "offensive",
      chase: true,
      secure: true,
    });
  });
});
