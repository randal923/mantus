import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_LIMITS } from "@tibia/protocol";
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
      chase: false,
      secure: true,
    });
  });

  it("flushes tick messages in one transport batch", () => {
    const send = vi.fn();
    const socket = {
      OPEN: 1,
      readyState: 1,
      bufferedAmount: 0,
      on: vi.fn(),
      send,
    } as unknown as WebSocket;
    const session = new Session("session", "127.0.0.1", socket, {
      maxPendingIntents: 16,
      maxProtocolViolations: 5,
      initialViewRange: { x: 9, y: 7 },
    });

    session.beginBatch();
    session.send({ type: "error", code: "join-required" });
    session.send({ type: "error", code: "rate-limited" });

    expect(send).not.toHaveBeenCalled();
    session.flushBatch();
    expect(JSON.parse(send.mock.calls[0]?.[0] as string)).toEqual([
      { type: "error", code: "join-required" },
      { type: "error", code: "rate-limited" },
    ]);
  });

  it("terminates a slow socket before outbound data grows without bound", () => {
    const send = vi.fn();
    const terminate = vi.fn();
    const socket = {
      OPEN: 1,
      readyState: 1,
      bufferedAmount: PROTOCOL_LIMITS.maxSocketBufferedBytes,
      on: vi.fn(),
      send,
      terminate,
    } as unknown as WebSocket;
    const session = new Session("session", "127.0.0.1", socket, {
      maxPendingIntents: 16,
      maxProtocolViolations: 5,
      initialViewRange: { x: 9, y: 7 },
    });

    session.beginBatch();
    session.send({ type: "error", code: "rate-limited" });
    session.flushBatch();

    expect(send).not.toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledOnce();
  });
});
