"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CharacterCreationOptions,
  CharacterSummary,
  CreatureState,
  CreateCharacterInput,
  Direction,
  FightState,
  InventoryState,
  OwnCharacterState,
  ServerErrorCode,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { useHotkeys } from "../hooks/useHotkeys";
import type { ConnectionStatus, GameClient } from "../lib/net/GameClient";
import type { WorldRenderer } from "../lib/render/WorldRenderer";
import { updateVisibleCreatures } from "../lib/creatures/updateVisibleCreatures";
import { useLanguageStore } from "../stores/useLanguageStore";
import { getRuneCombatTarget } from "../lib/combat/getRuneCombatTarget";
import { CharacterSelectScreen } from "./characters/CharacterSelectScreen";
import { GameHud } from "./GameHud";
import { InventoryPanel } from "./inventory/InventoryPanel";
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
  const joinedRef = useRef(false);
  const resumeCharacterIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [characters, setCharacters] = useState<
    ReadonlyArray<CharacterSummary> | null
  >(null);
  const [creationOptions, setCreationOptions] =
    useState<CharacterCreationOptions | null>(null);
  const [ownCharacter, setOwnCharacter] =
    useState<OwnCharacterState | null>(null);
  const [visibleCreatures, setVisibleCreatures] = useState<
    ReadonlyArray<CreatureState>
  >([]);
  const [fightState, setFightState] = useState<FightState | null>(null);
  const [spells, setSpells] = useState<ReadonlyArray<SpellCatalogEntry>>([]);
  const [combatLog, setCombatLog] = useState<ReadonlyArray<string>>([]);
  const [characterBusy, setCharacterBusy] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [characterStatsOpen, setCharacterStatsOpen] = useState(false);
  const [inventory, setInventory] = useState<InventoryState | null>(null);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const [serverError, setServerError] = useState<ServerErrorCode | null>(null);

  const reconnect = (characterId: string | null) => {
    resumeCharacterIdRef.current = characterId;
    joinedRef.current = false;
    setStatus("connecting");
    setCharacters(null);
    setCreationOptions(null);
    setOwnCharacter(null);
    setInventory(null);
    setVisibleCreatures([]);
    setFightState(null);
    setSpells([]);
    setCombatLog([]);
    setCharacterBusy(characterId !== null);
    setInventoryOpen(false);
    setCharacterStatsOpen(false);
    setGameMenuOpen(false);
    setServerError(null);
    setConnectionAttempt((attempt) => attempt + 1);
  };

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useHotkeys((action) => {
    if (!ownCharacter) return;
    if (action === "toggleInventory") {
      if (gameMenuOpen) return;
      setCharacterStatsOpen(false);
      setInventoryOpen((open) => !open);
      return;
    }
    if (action === "toggleCharacterStats") {
      setGameMenuOpen(false);
      if (characterStatsOpen) {
        setCharacterStatsOpen(false);
        setInventoryOpen(false);
        return;
      }
      setInventoryOpen(true);
      setCharacterStatsOpen(true);
      return;
    }
    setInventoryOpen(false);
    setCharacterStatsOpen(false);
    setGameMenuOpen((open) => !open);
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let client: GameClient | undefined;
    let renderer: WorldRenderer | undefined;
    let heldMovementKeys: ReadonlyArray<string> = [];
    joinedRef.current = false;

    const syncViewport = () => {
      const range = renderer?.setViewportSize(
        container.clientWidth,
        container.clientHeight,
      );
      if (range) client?.setViewport(range);
    };
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(container);

    (async () => {
      const [{ GameClient }, { WorldRenderer }] = await Promise.all([
        import("../lib/net/GameClient"),
        import("../lib/render/WorldRenderer"),
      ]);
      if (disposed) return;

      const worldRenderer = new WorldRenderer({
        useMap: (position) => client?.useMap(position),
        attackTarget: (creatureId) => client?.attackTarget(creatureId),
        cancelAttack: () => client?.cancelAttack(),
        pickupMapItem: (item, position) =>
          client?.pickupMapItem(item, position),
      });
      await worldRenderer.init(container);
      if (disposed) {
        worldRenderer.destroy();
        return;
      }
      renderer = worldRenderer;
      syncViewport();

      client = new GameClient(WS_URL, {
        onMessage: (message) => {
          if (disposed) return;
          setVisibleCreatures((current) =>
            updateVisibleCreatures(current, message),
          );
          if (message.type === "character-list") {
            setCharacters(message.characters);
            setCreationOptions(message.creationOptions);
            setServerError(null);
            const resumeCharacterId = resumeCharacterIdRef.current;
            if (resumeCharacterId) {
              const canResume = message.characters.some(
                (character) => character.id === resumeCharacterId,
              );
              if (canResume && client?.selectCharacter(resumeCharacterId)) {
                setCharacterBusy(true);
                return;
              }
              resumeCharacterIdRef.current = null;
              setServerError("character-load-failed");
            }
            setCharacterBusy(false);
            return;
          }
          if (message.type === "welcome") {
            joinedRef.current = true;
            resumeCharacterIdRef.current = null;
            setOwnCharacter(message.character);
            setInventory(message.inventory);
            setFightState(message.fightState);
            setSpells(message.spells);
            setCharacterBusy(false);
            setServerError(null);
          }
          if (message.type === "inventory-updated") {
            setInventory(message.inventory);
            return;
          }
          if (message.type === "attack-target-changed") {
            setFightState((current) =>
              current
                ? { ...current, attackTargetId: message.creatureId }
                : current,
            );
          }
          if (message.type === "fight-state") {
            setFightState(message.fightState);
          }
          if (message.type === "combat-log") {
            setCombatLog((current) => [...current, message.text].slice(-6));
          }
          if (message.type === "creature-left") {
            setFightState((current) =>
              current?.attackTargetId === message.creatureId
                ? { ...current, attackTargetId: null }
                : current,
            );
          }
          if (message.type === "progression-updated") {
            setOwnCharacter((current) =>
              current?.id === message.playerId
                ? { ...current, ...message.progression }
                : current,
            );
            setInventory((current) =>
              current
                ? {
                    ...current,
                    capacityMax: message.progression.capacity,
                  }
                : current,
            );
            return;
          }
          if (
            message.type === "creature-moved" ||
            message.type === "position-correction"
          ) {
            const playerId =
              message.type === "creature-moved"
                ? message.creatureId
                : message.playerId;
            setOwnCharacter((current) =>
              current?.id === playerId
                ? {
                    ...current,
                    position: { ...message.position },
                    direction: message.direction,
                  }
                : current,
            );
          }
          worldRenderer.applyMessage(message);
        },
        onStatus: (nextStatus) => {
          if (disposed) return;
          if (nextStatus === "disconnected") joinedRef.current = false;
          if (nextStatus === "disconnected") setVisibleCreatures([]);
          if (nextStatus === "disconnected") setFightState(null);
          if (nextStatus === "disconnected") setSpells([]);
          if (nextStatus === "disconnected") setCombatLog([]);
          setStatus(nextStatus);
        },
        onLanguage: (nextLanguage) => {
          if (disposed) return;
          confirmedLanguageRef.current = nextLanguage;
          setLanguage(nextLanguage);
          setLanguageSaving(false);
          setLanguageError(false);
        },
        onError: (code) => {
          if (disposed) return;
          if (code === "language-update-failed") {
            setLanguage(confirmedLanguageRef.current);
            setLanguageSaving(false);
            setLanguageError(true);
            return;
          }
          resumeCharacterIdRef.current = null;
          if (code !== "language-update-pending") setLanguageSaving(false);
          setCharacterBusy(false);
          setServerError(code);
        },
      });
      clientRef.current = client;
      syncViewport();
      client.connect(accessToken, languageRef.current);
    })();

    const sendHeldDirection = (queueStep: boolean) => {
      const activeKey = heldMovementKeys[heldMovementKeys.length - 1];
      if (!activeKey) return;
      const direction = KEY_DIRECTIONS[activeKey];
      if (!direction) return;
      client?.sendMove(direction, queueStep);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code];
      if (!direction || !joinedRef.current) return;
      event.preventDefault();
      if (heldMovementKeys.includes(event.code)) return;
      heldMovementKeys = [...heldMovementKeys, event.code];
      sendHeldDirection(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!KEY_DIRECTIONS[event.code]) return;
      if (!joinedRef.current) return;
      event.preventDefault();
      const wasActive =
        heldMovementKeys[heldMovementKeys.length - 1] === event.code;
      heldMovementKeys = heldMovementKeys.filter(
        (keyCode) => keyCode !== event.code,
      );
      if (!wasActive) return;
      if (heldMovementKeys.length > 0) {
        sendHeldDirection(false);
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
      resizeObserver.disconnect();
      client?.disconnect();
      clientRef.current = null;
      renderer?.destroy();
      joinedRef.current = false;
    };
  }, [accessToken, connectionAttempt, setLanguage]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      <div aria-hidden className="ui-game-vignette pointer-events-none absolute inset-0 z-10" />
      {!ownCharacter ? (
        <CharacterSelectScreen
          status={status}
          characters={characters}
          creationOptions={creationOptions}
          busy={characterBusy}
          error={
            serverError
              ? t(`serverErrors.${serverError}`, {
                  defaultValue: t("serverErrors.unknown"),
                })
              : null
          }
          onLogout={onLogout}
          onReconnect={() => reconnect(null)}
          onCreate={(input: CreateCharacterInput) => {
            setServerError(null);
            if (clientRef.current?.createCharacter(input)) {
              setCharacterBusy(true);
              return;
            }
            setServerError("character-list-failed");
          }}
          onSelect={(characterId) => {
            setServerError(null);
            if (clientRef.current?.selectCharacter(characterId)) {
              setCharacterBusy(true);
              return;
            }
            setServerError("character-load-failed");
          }}
        />
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 z-40">
            <TopNavigationBar
              characterName={ownCharacter.name}
              level={ownCharacter.level}
              vocation={t(`vocations.${ownCharacter.vocation}.name`)}
              outfit={ownCharacter.outfit}
              health={ownCharacter.health}
              maxHealth={ownCharacter.maxHealth}
              mana={ownCharacter.mana}
              maxMana={ownCharacter.maxMana}
              connectionStatus={status}
              activePanel={
                characterStatsOpen
                  ? "character"
                  : inventoryOpen
                    ? "inventory"
                    : undefined
              }
              onCharacter={() => {
                setGameMenuOpen(false);
                setInventoryOpen(true);
                setCharacterStatsOpen(true);
              }}
              onInventory={() => {
                setGameMenuOpen(false);
                if (characterStatsOpen) {
                  setCharacterStatsOpen(false);
                  setInventoryOpen(true);
                  return;
                }
                setCharacterStatsOpen(false);
                setInventoryOpen((open) => !open);
              }}
              onSettings={() => {
                setInventoryOpen(false);
                setCharacterStatsOpen(false);
                setGameMenuOpen(true);
              }}
            />
          </div>
          {status === "disconnected" && (
            <button
              type="button"
              role="alert"
              onClick={() => reconnect(ownCharacter.id)}
              className="ui-panel-frame absolute top-24 left-1/2 z-50 -translate-x-1/2 px-4 py-3 font-tibia text-sm text-ui-text-bright"
            >
              {t("connection.disconnected")} · {t("connection.reconnect")}
            </button>
          )}
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
          {fightState && (
            <GameHud
              spellHotkeysEnabled={!gameMenuOpen && !characterStatsOpen}
              visibleCreatures={visibleCreatures}
              ownCharacter={ownCharacter}
              fightState={fightState}
              spells={spells}
              hasWeapon={Boolean(inventory?.equipment.weapon)}
              combatLog={combatLog}
              onFightModeChange={(mode) =>
                clientRef.current?.setFightMode(mode)
              }
              onCast={(spellId, target) =>
                clientRef.current?.castSpell(spellId, target)
              }
            />
          )}
          {inventoryOpen && inventory && (
            <div
              className={`absolute top-24 right-4 bottom-4 z-30 w-[calc(100vw-2rem)] transition-[max-width] duration-300 ease-in-out motion-reduce:transition-none ${
                characterStatsOpen ? "max-w-3xl" : "max-w-96"
              }`}
            >
              <InventoryPanel
                characterName={ownCharacter.name}
                character={ownCharacter}
                characterStatsOpen={characterStatsOpen}
                {...inventory}
                onClose={() => {
                  setInventoryOpen(false);
                  setCharacterStatsOpen(false);
                }}
                onToggleCharacterStats={() =>
                  setCharacterStatsOpen((open) => !open)
                }
                onEquip={(item) => clientRef.current?.equipItem(item)}
                onUnequip={(item, slot) =>
                  clientRef.current?.unequipItem(item, slot)
                }
                onUseRune={(item) => {
                  const rune = spells.find(
                    (spell) =>
                      spell.origin === "rune" &&
                      spell.runeItemTypeId === item.typeId,
                  );
                  const target = getRuneCombatTarget(
                    rune,
                    fightState?.attackTargetId ?? null,
                    visibleCreatures,
                    ownCharacter.position,
                  );
                  clientRef.current?.useRune(item, target);
                }}
                onDrop={(item) =>
                  clientRef.current?.dropItem(item, ownCharacter.position)
                }
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
        </>
      )}
    </div>
  );
}
