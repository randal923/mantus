"use client";

import { useEffect, useRef, useState } from "react";
import type { Direction, ServerErrorCode } from "@tibia/protocol";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { useHotkeys } from "../hooks/useHotkeys";
import type { ConnectionStatus, GameClient } from "../lib/net/GameClient";
import type { WorldRenderer } from "../lib/render/WorldRenderer";
import { useLanguageStore } from "../stores/useLanguageStore";
import { GameHud } from "./GameHud";
import { InventoryPanel } from "./inventory/InventoryPanel";
import { getPlaceholderInventory } from "./inventory/getPlaceholderInventory";
import { getPlaceholderCharacter } from "./navigation/getPlaceholderCharacter";
import { TopNavigationBar } from "./navigation/TopNavigationBar";
import { GameMenuModal } from "./settings/GameMenuModal";

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
  onLogout: () => void | Promise<void>;
}

export default function GameWindow({ accessToken, onLogout }: GameWindowProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<GameClient | null>(null);
  const languageRef = useRef(language);
  const confirmedLanguageRef = useRef(language);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const [serverError, setServerError] = useState<ServerErrorCode | null>(null);
  const placeholderCharacter = getPlaceholderCharacter(t);
  const placeholderInventory = getPlaceholderInventory(t);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useHotkeys((action) => {
    if (action === "toggleInventory") {
      if (gameMenuOpen) return;
      setInventoryOpen((open) => !open);
      return;
    }
    setInventoryOpen(false);
    setGameMenuOpen((open) => !open);
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
        onLanguage: (nextLanguage) => {
          confirmedLanguageRef.current = nextLanguage;
          setLanguage(nextLanguage);
          setLanguageSaving(false);
          setLanguageError(false);
        },
        onError: (code) => {
          if (code === "language-update-failed") {
            setLanguage(confirmedLanguageRef.current);
            setLanguageSaving(false);
            setLanguageError(true);
            return;
          }
          if (code !== "language-update-pending") setLanguageSaving(false);
          setServerError(code);
        },
      });
      clientRef.current = client;
      client.connect(
        accessToken,
        `Hero-${Math.random().toString(36).slice(2, 6)}`,
        languageRef.current,
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
      clientRef.current = null;
      renderer?.destroy();
    };
  }, [accessToken, setLanguage]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      <div aria-hidden className="ui-game-vignette pointer-events-none absolute inset-0 z-10" />
      <div className="absolute inset-x-0 top-0 z-40">
        <TopNavigationBar
          {...placeholderCharacter}
          connectionStatus={status}
          activePanel={inventoryOpen ? "inventory" : undefined}
          onInventory={() => setInventoryOpen((open) => !open)}
          onSettings={() => {
            setInventoryOpen(false);
            setGameMenuOpen(true);
          }}
        />
      </div>
      {serverError && (
        <button
          type="button"
          role="alert"
          onClick={() => setServerError(null)}
          className="ui-panel-frame absolute top-24 left-1/2 z-50 max-w-md -translate-x-1/2 px-4 py-3 font-tibia text-sm text-red-200"
        >
          {t(`serverErrors.${serverError}`, {
            defaultValue: t("serverErrors.unknown"),
          })}
        </button>
      )}
      <GameHud spellHotkeysEnabled={!gameMenuOpen} />
      {inventoryOpen && (
        <div className="absolute top-24 right-4 bottom-4 z-30 w-96">
          <InventoryPanel
            {...placeholderInventory}
            onClose={() => setInventoryOpen(false)}
          />
        </div>
      )}
      {gameMenuOpen && (
        <GameMenuModal
          onClose={() => setGameMenuOpen(false)}
          onLogout={onLogout}
          languageSaving={languageSaving}
          languageError={languageError}
          onChangeLanguage={(nextLanguage) => {
            setLanguage(nextLanguage);
            setLanguageSaving(true);
            setLanguageError(false);
            if (clientRef.current?.updateLanguage(nextLanguage)) return;
            setLanguage(confirmedLanguageRef.current);
            setLanguageSaving(false);
            setLanguageError(true);
          }}
        />
      )}
    </div>
  );
}
