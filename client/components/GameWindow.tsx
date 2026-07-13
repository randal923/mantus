"use client";

import { useEffect, useRef, useState } from "react";
import type { Direction } from "@tibia/protocol";
import type { ConnectionStatus, GameClient } from "../lib/net/GameClient";
import type { WorldRenderer } from "../lib/render/WorldRenderer";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";
const MOVE_SEND_MS = 120;

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
    const heldKeys: string[] = [];

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

    const onKeyDown = (event: KeyboardEvent) => {
      if (!KEY_DIRECTIONS[event.code]) return;
      event.preventDefault();
      if (event.repeat) return;
      heldKeys.push(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const index = heldKeys.indexOf(event.code);
      if (index >= 0) heldKeys.splice(index, 1);
    };
    const moveTimer = setInterval(() => {
      const lastHeld = heldKeys[heldKeys.length - 1];
      const direction = lastHeld ? KEY_DIRECTIONS[lastHeld] : undefined;
      if (direction) client?.sendMove(direction);
    }, MOVE_SEND_MS);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      disposed = true;
      clearInterval(moveTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
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
