"use client";

import { useEffect, useRef, useState } from "react";
import type { Direction } from "@tibia/protocol";
import type { ConnectionStatus, GameClient } from "../lib/net/GameClient";
import type { WorldRenderer } from "../lib/render/WorldRenderer";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";
/** Minimum gap between move sends so OS key-repeat cannot exceed the
 * server's 30 messages/second rate limit. */
const MOVE_SEND_MS = 50;

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "north",
  ArrowRight: "east",
  ArrowDown: "south",
  ArrowLeft: "west",
  KeyW: "north",
  KeyD: "east",
  KeyS: "south",
  KeyA: "west",
};

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connecting: "#c0c000",
  connected: "#3fae4a",
  disconnected: "#c04040",
};

export default function GameWindow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let client: GameClient | undefined;
    let renderer: WorldRenderer | undefined;
    let lastMoveSentAt = 0;

    (async () => {
      const [{ GameClient }, { WorldRenderer }] = await Promise.all([
        import("../lib/net/GameClient"),
        import("../lib/render/WorldRenderer"),
      ]);
      if (disposed) return;

      const worldRenderer = new WorldRenderer();
      await worldRenderer.init(container);
      if (disposed) {
        worldRenderer.destroy();
        return;
      }
      renderer = worldRenderer;

      client = new GameClient(WS_URL, {
        onMessage: (message) => worldRenderer.applyMessage(message),
        onStatus: setStatus,
      });
      client.connect(`Hero-${Math.random().toString(36).slice(2, 6)}`);
    })();

    // simplest possible walking: every keydown (OS key-repeat included) sends
    // one move intent and the server decides — step if off cooldown,
    // otherwise just turn. Nothing is queued or replayed on either side.
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code];
      if (!direction) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastMoveSentAt < MOVE_SEND_MS) return;
      lastMoveSentAt = now;
      client?.sendMove(direction);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      client?.disconnect();
      renderer?.destroy();
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "rgba(20, 20, 20, 0.85)",
          border: "1px solid #555",
          borderRadius: 6,
          color: "#eee",
          fontFamily: "Verdana, sans-serif",
          fontSize: 12,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: STATUS_COLORS[status],
          }}
        />
        {status}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "6px 12px",
          background: "rgba(20, 20, 20, 0.75)",
          border: "1px solid #444",
          borderRadius: 6,
          color: "#bbb",
          fontFamily: "Verdana, sans-serif",
          fontSize: 11,
          whiteSpace: "nowrap",
        }}
      >
        WASD / arrows to walk · open a second tab to see another player
      </div>
    </div>
  );
}
