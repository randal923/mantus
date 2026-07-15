"use client";

import { useEffect, useRef, useState } from "react";
import type { Direction } from "@tibia/protocol";
import { useHotkeys } from "../hooks/useHotkeys";
import type { ConnectionStatus, GameClient } from "../lib/net/GameClient";
import type { WorldRenderer } from "../lib/render/WorldRenderer";
import { GameHud } from "./GameHud";
import { InventoryPanel } from "./inventory/InventoryPanel";
import { PLACEHOLDER_INVENTORY } from "./inventory/placeholderInventory";
import { PLACEHOLDER_CHARACTER } from "./navigation/placeholderCharacter";
import { TopNavigationBar } from "./navigation/TopNavigationBar";

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

interface GameWindowProps {
  accessToken: string;
}

export default function GameWindow({ accessToken }: GameWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [inventoryOpen, setInventoryOpen] = useState(false);

  useHotkeys((action) => {
    if (action === "toggleInventory") {
      setInventoryOpen((open) => !open);
    }
  });

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
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      <div aria-hidden className="ui-game-vignette pointer-events-none absolute inset-0 z-10" />
      <div className="absolute inset-x-0 top-0 z-40">
        <TopNavigationBar
          {...PLACEHOLDER_CHARACTER}
          connectionStatus={status}
          activePanel={inventoryOpen ? "inventory" : undefined}
          onInventory={() => setInventoryOpen((open) => !open)}
        />
      </div>
      <GameHud />
      {inventoryOpen && (
        <div className="absolute top-24 right-4 bottom-4 z-30 w-96">
          <InventoryPanel
            {...PLACEHOLDER_INVENTORY}
            onClose={() => setInventoryOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
