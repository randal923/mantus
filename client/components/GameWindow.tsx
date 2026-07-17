"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CharacterCreationOptions,
  CharacterSummary,
  CreatureState,
  CreateCharacterInput,
  Direction,
  FightState,
  InventoryItem,
  OwnCharacterState,
  ServerErrorCode,
  ServerMessage,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { useHotkeys } from "../hooks/useHotkeys";
import { useOptimisticInventory } from "../hooks/useOptimisticInventory";
import type {
  PendingItemOp,
  PendingItemOpIntent,
} from "../lib/inventory/PendingItemOp";
import type { ConnectionStatus, GameClient } from "../lib/net/GameClient";
import type { WorldRenderer } from "../lib/render/WorldRenderer";
import { updateVisibleCreatures } from "../lib/creatures/updateVisibleCreatures";
import { isEditableTarget } from "../lib/hotkeys/isEditableTarget";
import { useLanguageStore } from "../stores/useLanguageStore";
import { getRuneCombatTarget } from "../lib/combat/getRuneCombatTarget";
import { CharacterSelectScreen } from "./characters/CharacterSelectScreen";
import { GameHud } from "./GameHud";
import { InventoryPanel } from "./inventory/InventoryPanel";
import { ItemTextModal } from "./inventory/ItemTextModal";
import type { ItemDragSource } from "./inventory/ItemDragSource";
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
  Numpad7: "northwest",
  Numpad9: "northeast",
  Numpad1: "southwest",
  Numpad3: "southeast",
};

const KEY_VECTORS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowRight: [1, 0],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  KeyW: [0, -1],
  KeyD: [1, 0],
  KeyS: [0, 1],
  KeyA: [-1, 0],
};

function combinedHeldDirection(
  heldMovementKeys: ReadonlyArray<string>,
): Direction | null {
  let horizontal = 0;
  let vertical = 0;
  for (const key of heldMovementKeys) {
    const vector = KEY_VECTORS[key];
    if (!vector) continue;
    if (vector[0] !== 0) horizontal = vector[0];
    if (vector[1] !== 0) vertical = vector[1];
  }
  if (horizontal === 1 && vertical === -1) return "northeast";
  if (horizontal === 1 && vertical === 1) return "southeast";
  if (horizontal === -1 && vertical === 1) return "southwest";
  if (horizontal === -1 && vertical === -1) return "northwest";
  return null;
}

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
  const rendererRef = useRef<WorldRenderer | null>(null);
  const languageRef = useRef(language);
  const confirmedLanguageRef = useRef(language);
  const joinedRef = useRef(false);
  const resumeCharacterIdRef = useRef<string | null>(null);
  const pendingRuneRef = useRef<InventoryItem | null>(null);
  const itemDragRef = useRef<ItemDragSource | null>(null);
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
  const sendItemIntent = useCallback(
    (intent: PendingItemOpIntent) =>
      clientRef.current?.sendItemIntent(intent) ?? false,
    [],
  );
  const discardStaleMapPreviews = useCallback((op: PendingItemOp) => {
    if (op.kind === "drop" || op.kind === "pickup" || op.kind === "move-map") {
      rendererRef.current?.clearMapItemPreviews();
    }
  }, []);
  const {
    inventory,
    reset: resetInventory,
    confirm: confirmInventory,
    rollback: rollbackInventory,
    patch: patchInventory,
    dispatch: dispatchItemOp,
  } = useOptimisticInventory(sendItemIntent, discardStaleMapPreviews);
  const [itemText, setItemText] = useState<
    Extract<ServerMessage, { type: "item-text" }> | null
  >(null);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const [serverError, setServerError] = useState<ServerErrorCode | null>(null);
  const [runeTargeting, setRuneTargeting] = useState(false);

  const reconnect = (characterId: string | null) => {
    resumeCharacterIdRef.current = characterId;
    joinedRef.current = false;
    setStatus("connecting");
    setCharacters(null);
    setCreationOptions(null);
    setOwnCharacter(null);
    resetInventory(null);
    setItemText(null);
    setVisibleCreatures([]);
    setFightState(null);
    setSpells([]);
    setCombatLog([]);
    setCharacterBusy(characterId !== null);
    setInventoryOpen(false);
    setCharacterStatsOpen(false);
    setGameMenuOpen(false);
    itemDragRef.current = null;
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
        pickupMapItem: (item, position) => {
          dispatchItemOp({
            kind: "pickup",
            itemId: item.instanceId,
            revision: item.revision,
            position,
          });
          rendererRef.current?.previewMapItemRemoval(
            position,
            item.instanceId,
          );
        },
        beginMapItemDrag: (item, position) => {
          const source = { kind: "world", item, position } as const;
          itemDragRef.current = source;
        },
        endItemDrag: () => {
          itemDragRef.current = null;
        },
        dropDraggedItem: (position) => {
          const source = itemDragRef.current;
          if (source?.kind === "owned") {
            dispatchItemOp({
              kind: "drop",
              itemId: source.item.id,
              position,
            });
            rendererRef.current?.previewMapItemAddition(position, {
              instanceId: source.item.id,
              itemId: source.item.clientId,
              revision: source.item.revision,
              count: source.item.count,
            });
          } else if (
            source?.kind === "world" &&
            (source.position.x !== position.x ||
              source.position.y !== position.y ||
              source.position.z !== position.z)
          ) {
            dispatchItemOp({
              kind: "move-map",
              itemId: source.item.instanceId,
              revision: source.item.revision,
              fromPosition: source.position,
              toPosition: position,
            });
            rendererRef.current?.previewMapItemRemoval(
              source.position,
              source.item.instanceId,
            );
            rendererRef.current?.previewMapItemAddition(
              position,
              source.item,
            );
          }
          itemDragRef.current = null;
        },
        autoWalk: (directions) => client?.autoWalk(directions),
        targetPosition: (position) => {
          const rune = pendingRuneRef.current;
          if (!rune) return;
          pendingRuneRef.current = null;
          setRuneTargeting(false);
          client?.useRune(rune, { kind: "position", position });
        },
      });
      await worldRenderer.init(container);
      if (disposed) {
        worldRenderer.destroy();
        return;
      }
      renderer = worldRenderer;
      rendererRef.current = worldRenderer;
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
            resetInventory(message.inventory);
            setFightState(message.fightState);
            setSpells(message.spells);
            setCharacterBusy(false);
            setServerError(null);
          }
          if (message.type === "inventory-updated") {
            confirmInventory(message.inventory);
            return;
          }
          if (message.type === "item-text") {
            setItemText(message);
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
            patchInventory((current) => ({
              ...current,
              capacityMax: message.progression.capacity,
            }));
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
          if (nextStatus === "disconnected") setItemText(null);
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
          if (code === "item-action-failed") {
            rollbackInventory();
            worldRenderer.clearMapItemPreviews();
          }
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
      const direction =
        (KEY_VECTORS[activeKey]
          ? combinedHeldDirection(heldMovementKeys)
          : null) ??
        KEY_DIRECTIONS[activeKey];
      if (!direction) return;
      client?.sendMove(direction, queueStep);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code];
      if (
        !direction ||
        !joinedRef.current ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      if (heldMovementKeys.includes(event.code)) return;
      heldMovementKeys = [...heldMovementKeys, event.code];
      sendHeldDirection(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!KEY_DIRECTIONS[event.code]) return;
      if (!joinedRef.current) return;
      if (
        isEditableTarget(event.target) &&
        !heldMovementKeys.includes(event.code)
      ) {
        return;
      }
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
      rendererRef.current = null;
      joinedRef.current = false;
    };
  }, [
    accessToken,
    connectionAttempt,
    setLanguage,
    resetInventory,
    confirmInventory,
    patchInventory,
    rollbackInventory,
    dispatchItemOp,
  ]);

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
          {runeTargeting && (
            <div
              role="status"
              className="ui-panel-frame pointer-events-none absolute top-24 left-1/2 z-40 -translate-x-1/2 px-4 py-2 font-tibia text-sm text-ui-text-bright"
            >
              {t("combat.selectRuneTarget")}
            </div>
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
                onEquip={(item) => {
                  if (!item.equipmentSlot) return;
                  dispatchItemOp({
                    kind: "equip",
                    itemId: item.id,
                    slot: item.equipmentSlot,
                  });
                }}
                onUnequip={(item, slot) =>
                  dispatchItemOp({ kind: "unequip", itemId: item.id, slot })
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
                  if (rune?.targetKind === "position") {
                    pendingRuneRef.current = item;
                    setRuneTargeting(true);
                    setInventoryOpen(false);
                    setCharacterStatsOpen(false);
                    return;
                  }
                  clientRef.current?.useRune(item, target);
                }}
                onOpenContainer={(item) =>
                  clientRef.current?.openContainer(item)
                }
                onCloseContainer={(containerId) =>
                  clientRef.current?.closeContainer(containerId)
                }
                onUseItem={(item) => clientRef.current?.useItem(item)}
                onDragStart={(source) => {
                  itemDragRef.current = source;
                }}
                onDragEnd={() => {
                  itemDragRef.current = null;
                }}
                onDropInContainer={(destination, slot) => {
                  const source = itemDragRef.current;
                  if (!source) return;
                  if (
                    source.kind === "owned" &&
                    source.location.kind === "container" &&
                    source.location.containerId === destination.id &&
                    source.location.slot === slot
                  ) {
                    itemDragRef.current = null;
                    return;
                  }
                  if (source.kind === "world") {
                    dispatchItemOp({
                      kind: "pickup",
                      itemId: source.item.instanceId,
                      revision: source.item.revision,
                      position: source.position,
                      destination: { containerId: destination.id, slot },
                    });
                    rendererRef.current?.previewMapItemRemoval(
                      source.position,
                      source.item.instanceId,
                    );
                  } else if (source.location.kind === "equipment") {
                    dispatchItemOp({
                      kind: "unequip",
                      itemId: source.item.id,
                      slot: source.location.slot,
                      destination: { containerId: destination.id, slot },
                    });
                  } else {
                    dispatchItemOp({
                      kind: "move",
                      itemId: source.item.id,
                      destinationContainerId: destination.id,
                      destinationSlot: slot,
                    });
                  }
                  itemDragRef.current = null;
                }}
                onDropInEquipment={(slot) => {
                  const source = itemDragRef.current;
                  if (
                    source?.kind === "owned" &&
                    source.item.equipmentSlot === slot &&
                    !(
                      source.location.kind === "equipment" &&
                      source.location.slot === slot
                    )
                  ) {
                    dispatchItemOp({
                      kind: "equip",
                      itemId: source.item.id,
                      slot,
                    });
                  }
                  itemDragRef.current = null;
                }}
              />
            </div>
          )}
          {itemText && (
            <ItemTextModal
              key={`${itemText.itemId}:${itemText.revision}`}
              item={itemText}
              onClose={() => setItemText(null)}
              onSave={(text) => {
                if (
                  clientRef.current?.writeItem(
                    itemText.itemId,
                    itemText.revision,
                    text,
                  )
                ) {
                  setItemText(null);
                }
              }}
            />
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
