"use client";

import { useEffect, useRef, useState } from "react";
import type { Direction } from "@tibia/protocol";
import type { ConnectionStatus, GameClient } from "../lib/net/GameClient";
import type { WorldRenderer } from "../lib/render/WorldRenderer";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

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

interface GameWindowProps {
  accessToken: string;
}

export default function GameWindow({ accessToken }: GameWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let client: GameClient | undefined;
    let renderer: WorldRenderer | undefined;
    let heldMovementKeys: ReadonlyArray<string> = [];

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
      client.connect(
        accessToken,
        `Hero-${Math.random().toString(36).slice(2, 6)}`,
      );
    })();

    const sendHeldDirection = () => {
      const activeKey = heldMovementKeys[heldMovementKeys.length - 1];
      if (!activeKey) return;
      const direction = KEY_DIRECTIONS[activeKey];
      if (!direction) return;
      client?.sendMove(direction);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code];
      if (!direction) return;
      event.preventDefault();
      if (heldMovementKeys.includes(event.code)) return;
      heldMovementKeys = [...heldMovementKeys, event.code];
      sendHeldDirection();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!KEY_DIRECTIONS[event.code]) return;
      event.preventDefault();
      const wasActive =
        heldMovementKeys[heldMovementKeys.length - 1] === event.code;
      heldMovementKeys = heldMovementKeys.filter(
        (keyCode) => keyCode !== event.code,
      );
      if (!wasActive) return;
      if (heldMovementKeys.length > 0) {
        sendHeldDirection();
        return;
      }
      client?.stopMoving();
    };

    const onBlur = () => {
      if (heldMovementKeys.length === 0) return;
      heldMovementKeys = [];
      client?.stopMoving();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      client?.disconnect();
      renderer?.destroy();
    };
  }, [accessToken]);

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
