"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type {
  BankActionFailedReason,
  DepotStateMessage,
  MailActionFailedReason,
  ShopActionFailedReason,
  ShopEntryProjection,
  ShopTransactedMessage,
  CharacterCreationOptions,
  CharacterSummary,
  CreatureState,
  CreateCharacterInput,
  FightState,
  InventoryItem,
  InventoryState,
  OwnCharacterState,
  ServerErrorCode,
  ServerMessage,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { i18n } from "../i18n/i18n";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { useHotkeys } from "../hooks/useHotkeys";
import { useOptimisticDepot } from "../hooks/useOptimisticDepot";
import { useOptimisticInventory } from "../hooks/useOptimisticInventory";
import type { QueuedDepotAction } from "../lib/depot/QueuedDepotAction";
import type {
  PendingItemOp,
  PendingItemOpIntent,
} from "../lib/inventory/PendingItemOp";
import {
  chatReducer,
  initialChatState,
  LOCAL_CHANNEL_ID,
  SYSTEM_CHANNEL_ID,
} from "../lib/chat/chatReducer";
import { formatChatTime } from "../lib/chat/formatChatTime";
import { parseChatInput } from "../lib/chat/parseChatInput";
import { sanitizeChatText } from "../lib/chat/sanitizeChatText";
import { toChatMessage } from "../lib/chat/toChatMessage";
import type { ConnectionStatus, GameClient } from "../lib/net/GameClient";
import type { WorldRenderer } from "../lib/render/WorldRenderer";
import { updateVisibleCreatures } from "../lib/creatures/updateVisibleCreatures";
import { isEditableTarget } from "../lib/hotkeys/isEditableTarget";
import { useLanguageStore } from "../stores/useLanguageStore";
import { getRuneCombatTarget } from "../lib/combat/getRuneCombatTarget";
import { getHeldMovementDirection } from "../lib/movement/getHeldMovementDirection";
import { exceedsCapacity } from "../lib/inventory/exceedsCapacity";
import { toInventoryItemPresentation } from "../lib/inventory/toInventoryItemPresentation";
import { validateItemOp } from "../lib/inventory/validateItemOp";
import { CharacterSelectScreen } from "./characters/CharacterSelectScreen";
import { GameHud } from "./GameHud";
import { InventoryPanel } from "./inventory/InventoryPanel";
import { ItemTextModal } from "./inventory/ItemTextModal";
import type { ItemDragSource } from "./inventory/ItemDragSource";
import { TopNavigationBar } from "./navigation/TopNavigationBar";
import { GameMenuModal } from "./settings/GameMenuModal";
import { useGameSettingsStore } from "../stores/useGameSettingsStore";
import { NpcDialogue } from "./npc/NpcDialogue";
import { BankPanel } from "./bank/BankPanel";
import { ShopPanel } from "./shop/ShopPanel";
import { DepotModal } from "./depot/DepotModal";
import { MailboxModal } from "./depot/MailboxModal";

interface BankSessionState {
  npcId: string;
  npcName: string;
  balance: number;
  pending: boolean;
  error: BankActionFailedReason | null;
}

interface ShopSessionState {
  npcId: string;
  npcName: string;
  shopSessionId: string;
  currencyItemTypeId: number;
  currencySpriteId: number;
  currencyName: string;
  currencyAmount: number;
  pageCount: number;
  nextPage: number;
  entries: ReadonlyArray<ShopEntryProjection>;
  pending: boolean;
  error: ShopActionFailedReason | null;
  lastTransaction: ShopTransactedMessage | null;
  pendingPurchaseCost: number;
}

interface MailboxSessionState {
  sessionId: string;
  pending: boolean;
  error: MailActionFailedReason | null;
  sentRecipient: string | null;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";
const GOLD_COIN_TYPE_ID = 3031;

interface GameWindowProps {
  accessToken: string;
  onLogout: () => void | Promise<void>;
}

export default function GameWindow({ accessToken, onLogout }: GameWindowProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const diagonalWalking = useGameSettingsStore(
    (state) => state.diagonalWalking,
  );
  const setDiagonalWalking = useGameSettingsStore(
    (state) => state.setDiagonalWalking,
  );
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
  const [chatState, dispatchChat] = useReducer(chatReducer, initialChatState);
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
  const ownCharacterRef = useRef<OwnCharacterState | null>(null);
  useEffect(() => {
    ownCharacterRef.current = ownCharacter;
  }, [ownCharacter]);
  const validateItemOpLocally = useCallback(
    (op: PendingItemOp, projected: InventoryState) => {
      const character = ownCharacterRef.current;
      return character ? validateItemOp(op, projected, character) : null;
    },
    [],
  );
  const {
    inventory,
    reset: resetInventory,
    confirm: confirmInventory,
    rollback: rollbackInventory,
    patch: patchInventory,
    preview: previewInventory,
    rejectPreview: rejectInventoryPreview,
    clearPreviews: clearInventoryPreviews,
    getConfirmedItem,
    dispatch: dispatchItemOp,
  } = useOptimisticInventory(
    sendItemIntent,
    discardStaleMapPreviews,
    validateItemOpLocally,
  );
  const dispatchItemOpChecked = useCallback(
    (op: PendingItemOp): boolean => {
      const rejection = dispatchItemOp(op);
      if (!rejection) return true;
      setCombatLog((current) =>
        [...current, i18n.t(`inventory.rejections.${rejection}`)].slice(-6),
      );
      return false;
    },
    [dispatchItemOp],
  );
  const sendDepotAction = useCallback(
    (action: QueuedDepotAction, state: DepotStateMessage): boolean => {
      const prediction = action.depotPrediction;
      if (prediction.kind === "deposit") {
        const item = getConfirmedItem(prediction.item.id);
        return item
          ? (clientRef.current?.depositInDepot(state, item) ?? false)
          : false;
      }
      if (prediction.kind === "withdraw") {
        return (
          clientRef.current?.withdrawFromDepot(state, prediction.item) ?? false
        );
      }
      if (prediction.kind === "stash-deposit") {
        const item = getConfirmedItem(prediction.item.id);
        return item
          ? (clientRef.current?.depositInStash(
              state,
              item,
              prediction.count,
            ) ?? false)
          : false;
      }
      return (
        clientRef.current?.withdrawFromStash(
          state,
          prediction.item.itemTypeId,
          prediction.count,
        ) ?? false
      );
    },
    [getConfirmedItem],
  );
  const {
    session: depotSession,
    confirm: confirmDepot,
    fail: failDepot,
    beginBrowse: beginDepotBrowse,
    enqueue: enqueueDepotAction,
    reject: rejectDepotAction,
    close: closeDepot,
    reset: resetDepot,
  } = useOptimisticDepot(
    sendDepotAction,
    previewInventory,
    rejectInventoryPreview,
    clearInventoryPreviews,
  );
  const [itemText, setItemText] = useState<
    Extract<ServerMessage, { type: "item-text" }> | null
  >(null);
  const [npcDialogue, setNpcDialogue] = useState<
    Extract<ServerMessage, { type: "npc-dialogue" }> | null
  >(null);
  const [bankSession, setBankSession] = useState<BankSessionState | null>(
    null,
  );
  const [shopSession, setShopSession] = useState<ShopSessionState | null>(
    null,
  );
  const [mailboxSession, setMailboxSession] =
    useState<MailboxSessionState | null>(null);
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
    setNpcDialogue(null);
    setBankSession(null);
    setShopSession(null);
    resetDepot();
    setMailboxSession(null);
    setVisibleCreatures([]);
    setFightState(null);
    setSpells([]);
    setCombatLog([]);
    dispatchChat({ type: "reset", ownPlayerId: null, ownName: null });
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
          const queued = dispatchItemOpChecked({
            kind: "pickup",
            itemId: item.instanceId,
            revision: item.revision,
            position,
          });
          if (queued) {
            rendererRef.current?.previewMapItemRemoval(
              position,
              item.instanceId,
            );
          }
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
            const queued = dispatchItemOpChecked({
              kind: "drop",
              itemId: source.item.id,
              position,
            });
            if (queued) {
              rendererRef.current?.previewMapItemAddition(position, {
                instanceId: source.item.id,
                itemId: source.item.clientId,
                revision: source.item.revision,
                count: source.item.count,
              });
            }
          } else if (
            source?.kind === "world" &&
            (source.position.x !== position.x ||
              source.position.y !== position.y ||
              source.position.z !== position.z)
          ) {
            const queued = dispatchItemOpChecked({
              kind: "move-map",
              itemId: source.item.instanceId,
              revision: source.item.revision,
              fromPosition: source.position,
              toPosition: position,
            });
            if (queued) {
              rendererRef.current?.previewMapItemRemoval(
                source.position,
                source.item.instanceId,
              );
              rendererRef.current?.previewMapItemAddition(
                position,
                source.item,
              );
            }
          }
          itemDragRef.current = null;
        },
        autoWalk: (directions) => client?.autoWalk(directions),
        targetPosition: (position) => {
          const rune = pendingRuneRef.current;
          if (!rune) return false;
          pendingRuneRef.current = null;
          setRuneTargeting(false);
          client?.useRune(rune, { kind: "position", position });
          return true;
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
            setNpcDialogue(null);
            setBankSession(null);
            setShopSession(null);
            resetDepot();
            setMailboxSession(null);
            dispatchChat({
              type: "reset",
              ownPlayerId: message.playerId,
              ownName: message.character.name,
            });
          }
          if (message.type === "creature-spoke") {
            dispatchChat({
              type: "spoke",
              creatureId: message.creatureId,
              name: message.name,
              mode: message.mode,
              body: message.text,
              time: formatChatTime(),
            });
          }
          if (message.type === "npc-dialogue") {
            setNpcDialogue(message);
            dispatchChat({
              type: "spoke",
              creatureId: message.npcId,
              name: message.npcName,
              mode: "say",
              body: message.text,
              time: formatChatTime(),
            });
          }
          if (message.type === "npc-dialogue-closed") {
            setNpcDialogue((current) =>
              current?.npcId === message.npcId &&
              current.conversationId === message.conversationId
                ? null
                : current,
            );
            setShopSession((current) =>
              current?.npcId === message.npcId ? null : current,
            );
          }
          if (message.type === "bank-opened") {
            setShopSession(null);
            resetDepot();
            setMailboxSession(null);
            setBankSession({
              npcId: message.npcId,
              npcName: message.npcName,
              balance: message.balance,
              pending: false,
              error: null,
            });
            return;
          }
          if (message.type === "bank-updated") {
            setBankSession((current) =>
              current
                ? {
                    ...current,
                    balance: message.balance,
                    pending: false,
                    error: null,
                  }
                : current,
            );
            return;
          }
          if (message.type === "bank-action-failed") {
            setBankSession((current) => {
              if (!current) return current;
              if (message.reason === "out-of-range") return null;
              return { ...current, pending: false, error: message.reason };
            });
            return;
          }
          if (message.type === "shop-opened") {
            setBankSession(null);
            resetDepot();
            setMailboxSession(null);
            setShopSession((current) => {
              if (message.page === 1) {
                return {
                  npcId: message.npcId,
                  npcName: message.npcName,
                  shopSessionId: message.shopSessionId,
                  currencyItemTypeId: message.currencyItemTypeId,
                  currencySpriteId: message.currencySpriteId,
                  currencyName: message.currencyName,
                  currencyAmount: message.currencyAmount,
                  pageCount: message.pageCount,
                  nextPage: 2,
                  entries: message.entries,
                  pending: false,
                  error: null,
                  lastTransaction: null,
                  pendingPurchaseCost: 0,
                };
              }
              if (
                !current ||
                current.shopSessionId !== message.shopSessionId ||
                current.pageCount !== message.pageCount ||
                current.nextPage !== message.page ||
                current.currencyItemTypeId !== message.currencyItemTypeId
              ) {
                return current;
              }
              return {
                ...current,
                entries: [...current.entries, ...message.entries],
                nextPage: current.nextPage + 1,
              };
            });
            return;
          }
          if (message.type === "shop-transacted") {
            setShopSession((current) =>
              current
                ? {
                    ...current,
                    pending: false,
                    error: null,
                    lastTransaction: message,
                    pendingPurchaseCost: 0,
                    currencyAmount:
                      current.currencyItemTypeId === GOLD_COIN_TYPE_ID
                        ? current.currencyAmount
                        : Math.max(
                            0,
                            current.currencyAmount +
                              (message.kind === "sale"
                                ? message.totalPrice
                                : -message.totalPrice),
                          ),
                  }
                : current,
            );
            return;
          }
          if (message.type === "shop-action-failed") {
            rejectInventoryPreview();
            setShopSession((current) => {
              if (!current) return current;
              if (
                message.reason === "out-of-range" ||
                message.reason === "unavailable"
              ) {
                return null;
              }
              return {
                ...current,
                pending: false,
                error: message.reason,
                pendingPurchaseCost: 0,
              };
            });
            return;
          }
          if (message.type === "depot-state") {
            setBankSession(null);
            setShopSession(null);
            setMailboxSession(null);
            confirmDepot(message);
            return;
          }
          if (message.type === "depot-action-failed") {
            failDepot(message.reason);
            return;
          }
          if (message.type === "mailbox-opened") {
            setBankSession(null);
            setShopSession(null);
            resetDepot();
            setMailboxSession({
              sessionId: message.sessionId,
              pending: false,
              error: null,
              sentRecipient: null,
            });
            return;
          }
          if (message.type === "mail-sent") {
            setMailboxSession((current) =>
              current
                ? {
                    ...current,
                    pending: false,
                    error: null,
                    sentRecipient: message.recipientName,
                  }
                : current,
            );
            return;
          }
          if (message.type === "mail-action-failed") {
            setMailboxSession((current) => {
              if (!current) return current;
              if (message.reason === "out-of-range") return null;
              return { ...current, pending: false, error: message.reason };
            });
            return;
          }
          if (message.type === "private-chat-delivered") {
            dispatchChat({
              type: "private",
              direction: message.direction,
              counterpart: message.counterpart,
              body: message.text,
              time: formatChatTime(),
            });
            return;
          }
          if (message.type === "chat-rejected") {
            dispatchChat({
              type: "rejected",
              reason: message.reason,
              time: formatChatTime(),
              ...(message.retryAfterMs === undefined
                ? {}
                : { retryAfterMs: message.retryAfterMs }),
            });
            return;
          }
          if (message.type === "inventory-updated") {
            confirmInventory(message.inventory);
            setShopSession((current) =>
              current?.currencyItemTypeId === GOLD_COIN_TYPE_ID
                ? { ...current, pendingPurchaseCost: 0 }
                : current,
            );
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
          if (nextStatus === "disconnected") setNpcDialogue(null);
          if (nextStatus === "disconnected") resetDepot();
          if (nextStatus === "disconnected") setMailboxSession(null);
          if (nextStatus === "disconnected") clearInventoryPreviews();
          if (nextStatus === "disconnected") {
            dispatchChat({ type: "reset", ownPlayerId: null, ownName: null });
          }
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
      const direction = getHeldMovementDirection(
        heldMovementKeys,
        useGameSettingsStore.getState().diagonalWalking,
      );
      if (!direction) return;
      client?.sendMove(direction, queueStep);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = getHeldMovementDirection(
        [event.code],
        useGameSettingsStore.getState().diagonalWalking,
      );
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
      if (!getHeldMovementDirection([event.code], true)) return;
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
    clearInventoryPreviews,
    rejectInventoryPreview,
    rollbackInventory,
    dispatchItemOp,
    dispatchItemOpChecked,
    resetDepot,
    confirmDepot,
    failDepot,
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
                if (characterStatsOpen) {
                  setCharacterStatsOpen(false);
                  setInventoryOpen(false);
                  return;
                }
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
              chatChannels={[
                ...chatState.channels.map((channel) => ({
                  id: channel.id,
                  label: channel.counterpart ?? t("chat.channels.local"),
                  kind: channel.kind,
                  canSend: true,
                  closable: channel.kind === "whisper",
                  unreadCount: channel.unreadCount,
                  messages: channel.entries.map((entry) =>
                    toChatMessage(entry, t),
                  ),
                })),
                {
                  id: SYSTEM_CHANNEL_ID,
                  label: t("chat.channels.system"),
                  kind: "system",
                  description: t("chat.systemDescription"),
                  canSend: false,
                  messages: combatLog.map((body, index) => ({
                    id: `combat:${index}:${body}`,
                    body,
                    tone: "combat" as const,
                  })),
                },
              ]}
              chatSelectedChannelId={chatState.activeChannelId}
              onChatChannelSelect={(channelId) =>
                dispatchChat({ type: "select", channelId })
              }
              onChatChannelClose={(channelId) =>
                dispatchChat({ type: "close", channelId })
              }
              onChatSenderSelect={(sender) => {
                if (sender === ownCharacter.name) return;
                dispatchChat({ type: "open-private", counterpart: sender });
              }}
              onSendChat={(channelId, body) => {
                if (channelId === LOCAL_CHANNEL_ID) {
                  const { mode, text } = parseChatInput(body);
                  if (text.length > 0) clientRef.current?.speak(mode, text);
                  return;
                }
                const channel = chatState.channels.find(
                  (candidate) => candidate.id === channelId,
                );
                if (!channel?.counterpart) return;
                const text = sanitizeChatText(body);
                if (text.length === 0) return;
                clientRef.current?.sendPrivateChat(channel.counterpart, text);
              }}
              onFightModeChange={(mode) =>
                clientRef.current?.setFightMode(mode)
              }
              onCast={(spellId, target) =>
                clientRef.current?.castSpell(spellId, target)
              }
            />
          )}
          {npcDialogue && (
            <div className="absolute inset-x-4 bottom-24 z-30 flex justify-center">
              <NpcDialogue
                dialogue={npcDialogue}
                onChoice={(choiceId) =>
                  clientRef.current?.sendNpcDialogueChoice(
                    npcDialogue.npcId,
                    npcDialogue.conversationId,
                    choiceId,
                  )
                }
              />
            </div>
          )}
          {bankSession && inventory && (
            <BankPanel
              npcName={bankSession.npcName}
              balance={bankSession.balance}
              carriedGold={inventory.gold}
              carriedPlatinum={inventory.platinum}
              carriedCrystal={inventory.crystal}
              pending={bankSession.pending}
              error={bankSession.error}
              onDeposit={(amount) => {
                setBankSession((current) =>
                  current ? { ...current, pending: true, error: null } : current,
                );
                clientRef.current?.bankDeposit(bankSession.npcId, amount);
              }}
              onWithdraw={(amount) => {
                setBankSession((current) =>
                  current ? { ...current, pending: true, error: null } : current,
                );
                clientRef.current?.bankWithdraw(bankSession.npcId, amount);
              }}
              onTransfer={(toCharacterName, amount) => {
                setBankSession((current) =>
                  current ? { ...current, pending: true, error: null } : current,
                );
                clientRef.current?.bankTransfer(
                  bankSession.npcId,
                  toCharacterName,
                  amount,
                );
              }}
              onClose={() => setBankSession(null)}
            />
          )}
          {shopSession && inventory && (
            <ShopPanel
              npcName={shopSession.npcName}
              entries={shopSession.entries}
              carriedTotal={
                Math.max(
                  0,
                  (shopSession.currencyItemTypeId === GOLD_COIN_TYPE_ID
                    ? inventory.gold +
                      inventory.platinum * 100 +
                      inventory.crystal * 10_000
                    : shopSession.currencyAmount) -
                    shopSession.pendingPurchaseCost,
                )
              }
              currencyName={shopSession.currencyName}
              currencySpriteId={shopSession.currencySpriteId}
              pending={shopSession.pending}
              error={shopSession.error}
              lastTransaction={shopSession.lastTransaction}
              onBuy={(offerId, amount) => {
                const entry = shopSession.entries.find(
                  (candidate) => candidate.offerId === offerId,
                );
                if (!entry || entry.buyPrice === undefined) return;
                const totalCost = entry.buyPrice * amount;
                const funds =
                  shopSession.currencyItemTypeId === GOLD_COIN_TYPE_ID
                    ? inventory.gold +
                      inventory.platinum * 100 +
                      inventory.crystal * 10_000
                    : shopSession.currencyAmount;
                // Payment coins leave the inventory, by a weight the client
                // cannot compute, so only a certainly-too-heavy purchase is
                // rejected here; the server does the exact capacity check.
                const rejection: ShopActionFailedReason | null =
                  totalCost > funds - shopSession.pendingPurchaseCost
                    ? "insufficient-funds"
                    : entry.weight * amount > inventory.capacityMax * 100
                      ? "no-capacity"
                      : null;
                if (rejection) {
                  setShopSession((current) =>
                    current?.shopSessionId === shopSession.shopSessionId
                      ? { ...current, error: rejection }
                      : current,
                  );
                  return;
                }
                const predicted = previewInventory({
                  kind: "add",
                  item: toInventoryItemPresentation(entry),
                  count: amount,
                  itemIds: Array.from(
                    {
                      length: entry.stackable
                        ? Math.ceil(amount / entry.maxCount)
                        : amount,
                    },
                    () => crypto.randomUUID(),
                  ),
                });
                if (!predicted) {
                  setShopSession((current) =>
                    current?.shopSessionId === shopSession.shopSessionId
                      ? { ...current, error: "busy" }
                      : current,
                  );
                  return;
                }
                const sent =
                  clientRef.current?.shopBuy(
                    shopSession.npcId,
                    shopSession.shopSessionId,
                    offerId,
                    amount,
                  ) ?? false;
                if (!sent) {
                  rejectInventoryPreview();
                }
                setShopSession((current) =>
                  current?.shopSessionId === shopSession.shopSessionId
                    ? {
                        ...current,
                        pending: sent,
                        error: sent ? null : "failed",
                        pendingPurchaseCost: sent
                          ? entry.buyPrice! * amount
                          : 0,
                      }
                    : current,
                );
              }}
              onSell={(offerId, amount) => {
                const sent =
                  clientRef.current?.shopSell(
                    shopSession.npcId,
                    shopSession.shopSessionId,
                    offerId,
                    amount,
                  ) ?? false;
                if (!sent) return;
                setShopSession((current) =>
                  current?.shopSessionId === shopSession.shopSessionId
                    ? { ...current, pending: true, error: null }
                    : current,
                );
              }}
              onClose={() => setShopSession(null)}
            />
          )}
          {depotSession && inventory && (
            <DepotModal
              key={depotSession.state.sessionId}
              state={depotSession.state}
              inventoryItems={inventory.items}
              pending={depotSession.navigationPending}
              actionsDisabled={depotSession.actionsDisabled}
              error={depotSession.error}
              onBrowse={(location, page, query) => {
                const sent =
                  clientRef.current?.browseDepot(
                    depotSession.state,
                    location,
                    page,
                    query,
                  ) ?? false;
                beginDepotBrowse(sent);
              }}
              onDeposit={(item) => {
                if (
                  depotSession.state.depotCount >=
                  depotSession.state.depotCapacity
                ) {
                  rejectDepotAction("depot-full");
                  return;
                }
                enqueueDepotAction({
                  depotPrediction: { kind: "deposit", item },
                  inventoryPrediction: {
                    kind: "remove",
                    itemId: item.id,
                    count: item.count,
                  },
                });
              }}
              onWithdraw={(item) => {
                if (exceedsCapacity(inventory, item.weight * item.count)) {
                  rejectDepotAction("no-capacity");
                  return;
                }
                enqueueDepotAction({
                  depotPrediction: { kind: "withdraw", item },
                  inventoryPrediction: {
                    kind: "add",
                    item: toInventoryItemPresentation(item),
                    count: item.count,
                    itemIds: [item.itemId],
                  },
                });
              }}
              onStashDeposit={(item, count) => {
                enqueueDepotAction({
                  depotPrediction: { kind: "stash-deposit", item, count },
                  inventoryPrediction: {
                    kind: "remove",
                    itemId: item.id,
                    count,
                  },
                });
              }}
              onStashWithdraw={(item, count) => {
                if (exceedsCapacity(inventory, item.weight * count)) {
                  rejectDepotAction("no-capacity");
                  return;
                }
                enqueueDepotAction({
                  depotPrediction: { kind: "stash-withdraw", item, count },
                  inventoryPrediction: {
                    kind: "add",
                    item: toInventoryItemPresentation(item),
                    count,
                    itemIds: Array.from(
                      {
                        length: item.stackable
                          ? Math.ceil(count / item.maxCount)
                          : count,
                      },
                      () => crypto.randomUUID(),
                    ),
                  },
                });
              }}
              onClose={() => {
                clientRef.current?.closeDepot(depotSession.state.sessionId);
                closeDepot();
              }}
            />
          )}
          {mailboxSession && inventory && (
            <MailboxModal
              key={mailboxSession.sessionId}
              inventoryItems={inventory.items}
              pending={mailboxSession.pending}
              error={mailboxSession.error}
              sentRecipient={mailboxSession.sentRecipient}
              onSend={(item, recipientName) => {
                const sent =
                  clientRef.current?.sendMail(
                    mailboxSession.sessionId,
                    item,
                    recipientName,
                  ) ?? false;
                setMailboxSession((current) =>
                  current?.sessionId === mailboxSession.sessionId
                    ? {
                        ...current,
                        pending: sent,
                        error: sent ? null : "failed",
                        sentRecipient: null,
                      }
                    : current,
                );
              }}
              onClose={() => {
                clientRef.current?.closeMailbox(mailboxSession.sessionId);
                setMailboxSession(null);
              }}
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
                  dispatchItemOpChecked({
                    kind: "equip",
                    itemId: item.id,
                    slot: item.equipmentSlot,
                  });
                }}
                onUnequip={(item, slot) =>
                  dispatchItemOpChecked({
                    kind: "unequip",
                    itemId: item.id,
                    slot,
                  })
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
                    const queued = dispatchItemOpChecked({
                      kind: "pickup",
                      itemId: source.item.instanceId,
                      revision: source.item.revision,
                      position: source.position,
                      destination: { containerId: destination.id, slot },
                    });
                    if (queued) {
                      rendererRef.current?.previewMapItemRemoval(
                        source.position,
                        source.item.instanceId,
                      );
                    }
                  } else if (source.location.kind === "equipment") {
                    dispatchItemOpChecked({
                      kind: "unequip",
                      itemId: source.item.id,
                      slot: source.location.slot,
                      destination: { containerId: destination.id, slot },
                    });
                  } else {
                    dispatchItemOpChecked({
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
                  itemDragRef.current = null;
                  if (source?.kind !== "owned") return;
                  if (
                    source.location.kind === "equipment" &&
                    source.location.slot === slot
                  ) {
                    return;
                  }
                  dispatchItemOpChecked({
                    kind: "equip",
                    itemId: source.item.id,
                    slot,
                  });
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
              diagonalWalking={diagonalWalking}
              onDiagonalWalkingChange={setDiagonalWalking}
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
