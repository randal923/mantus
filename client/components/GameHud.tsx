"use client";

import { useState } from "react";
import {
  PROTOCOL_LIMITS,
  type ActionBar as ActionBarState,
  type ActionBarAction,
  type CreatureState,
  type FightState,
  type InventoryState,
  type MinimapLayout,
  type OwnCharacterState,
  type SpellCatalogEntry,
} from "@tibia/protocol";
import { ActionBar } from "./action-bar/ActionBar";
import type { ActionBarEditorRequest } from "./action-bar/ActionBarEditorRequest";
import { VitalOrb } from "./action-bar/VitalOrb";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { ChatPanel } from "./chat/ChatPanel";
import type { ChatChannel } from "./chat/chatTypes";
import { ConditionBar } from "./combat/ConditionBar";
import { OwnSkullIndicator } from "./pvp/OwnSkullIndicator";
import { BattleList } from "./creatures/BattleList";
import { MinimapPanel } from "./minimap/MinimapPanel";
import { getSpellIconArtwork } from "../lib/combat/getSpellIconArtwork";
import { getInventoryItems } from "../lib/inventory/getInventoryItems";
import { formatActionBarHotkey } from "../lib/hotkeys/formatActionBarHotkey";
import { createItemAction } from "../lib/action-bar/createItemAction";
import { getActionBarActionName } from "../lib/action-bar/getActionBarActionName";
import { getSpellActionTargetMode } from "../lib/action-bar/getSpellActionTargetMode";
import { SpriteIcon } from "./inventory/SpriteIcon";
import { SpellIcon } from "./spells/SpellIcon";

interface GameHudProps {
  actionHotkeysEnabled?: boolean;
  battleListVisible: boolean;
  minimapVisible: boolean;
  mapName: string | null;
  minimapLayout: MinimapLayout | null;
  onMinimapLayoutChange: (layout: MinimapLayout) => void;
  visibleCreatures: ReadonlyArray<CreatureState>;
  ownCharacter: OwnCharacterState;
  fightState: FightState;
  spells: ReadonlyArray<SpellCatalogEntry>;
  actionBar: ActionBarState;
  actionBotEnabled: boolean;
  inventory: InventoryState | null;
  hasWeapon: boolean;
  combatLog: ReadonlyArray<string>;
  chatPinnedOpen: boolean;
  chatFocusRequestId?: number;
  chatChannels?: ReadonlyArray<ChatChannel>;
  chatSelectedChannelId?: string;
  onActivateActionBar: (
    slotIndex: number,
    action: Exclude<ActionBarAction, { kind: "text" }>,
  ) => void;
  onActionBarChange: (actionBar: ActionBarState) => void;
  onConfigureActionBar: (
    slotIndex: number,
    section: ActionBarEditorRequest["section"],
  ) => void;
  onChatChannelSelect?: (channelId: string) => void;
  onChatChannelClose?: (channelId: string) => void;
  onChatSenderSelect?: (sender: string) => void;
  onSendChat?: (channelId: string, body: string) => void;
  onChatPinnedOpenChange: (pinnedOpen: boolean) => void;
}

export function GameHud({
  actionHotkeysEnabled = true,
  battleListVisible,
  minimapVisible,
  mapName,
  minimapLayout,
  onMinimapLayoutChange,
  visibleCreatures,
  ownCharacter,
  fightState,
  spells,
  actionBar,
  actionBotEnabled,
  inventory,
  hasWeapon,
  combatLog,
  chatPinnedOpen,
  chatFocusRequestId,
  chatChannels,
  chatSelectedChannelId,
  onActivateActionBar,
  onActionBarChange,
  onConfigureActionBar,
  onChatChannelSelect,
  onChatChannelClose,
  onChatSenderSelect,
  onSendChat,
  onChatPinnedOpenChange,
}: GameHudProps) {
  const { t } = useAppTranslation();
  const [chatDraftRequest, setChatDraftRequest] = useState<{
    readonly id: number;
    readonly text: string;
  }>();
  const inventoryItems = getInventoryItems(inventory);
  const slots = actionBar.map((slot, index) => {
    const hotkeyLabel = formatActionBarHotkey(slot.hotkey);
    const emptyTitle = `Configure action button ${index + 1}`;
    const emptyAriaLabel = `${emptyTitle}${hotkeyLabel ? ` (${hotkeyLabel})` : ""}`;
    const action = slot.action;
    if (!action) {
      return {
        action,
        hotkey: slot.hotkey,
        hotkeyLabel,
        emptyTitle,
        emptyAriaLabel,
        item: null,
      };
    }
    if (action.kind === "text") {
      return {
        action,
        hotkey: slot.hotkey,
        hotkeyLabel,
        emptyTitle,
        emptyAriaLabel,
        item: {
          icon: (
            <span className="flex size-8 items-center justify-center rounded border border-ui-gold/25 bg-black/35 font-display text-xs text-ui-gold">
              TXT
            </span>
          ),
          title: action.text,
          ariaLabel: `Text action: ${action.text}`,
        },
      };
    }
    if (action.kind === "spell") {
      const spell = spells.find(
        (candidate) =>
          candidate.origin === "spell" && candidate.id === action.spellId,
      );
      const cooldown = spell
        ? fightState.cooldowns
            .filter((entry) => spell.cooldownGroups.includes(entry.group))
            .sort((left, right) => right.readyAt - left.readyAt)[0]
        : undefined;
      const artwork = getSpellIconArtwork(action.spellId);
      const name = spell?.name ?? action.spellId;
      return {
        action,
        hotkey: slot.hotkey,
        hotkeyLabel,
        emptyTitle,
        emptyAriaLabel,
        item: {
          icon: artwork ? <SpellIcon {...artwork} /> : null,
          title: name,
          ariaLabel: `Cast ${name}`,
          badge: spell?.manaCost,
          badgeTone: "mana" as const,
          unavailable:
            !spell ||
            ownCharacter.level < spell.requiredLevel ||
            ownCharacter.magicLevel < spell.requiredMagicLevel ||
            ownCharacter.mana < spell.manaCost ||
            ownCharacter.soul < spell.soulCost ||
            (spell.needWeapon && !hasWeapon),
          ...(cooldown
            ? {
                cooldownReadyAt: cooldown.readyAt,
                cooldownTotalMs: cooldown.totalMs,
              }
            : {}),
        },
      };
    }
    const matchingItems = inventoryItems.filter(
      (item) => item.typeId === action.itemTypeId,
    );
    const item = matchingItems[0];
    const count = matchingItems.reduce(
      (total, candidate) => total + candidate.count,
      0,
    );
    const rune = spells.find(
      (spell) =>
        spell.origin === "rune" && spell.runeItemTypeId === action.itemTypeId,
    );
    const cooldown = rune
      ? fightState.cooldowns
          .filter((entry) => rune.cooldownGroups.includes(entry.group))
          .sort((left, right) => right.readyAt - left.readyAt)[0]
      : item?.useKind === "potion"
        ? fightState.cooldowns.find((entry) => entry.group === "potion")
        : undefined;
    const name = getActionBarActionName(action, spells, inventoryItems);
    return {
      action,
      hotkey: slot.hotkey,
      hotkeyLabel,
      emptyTitle,
      emptyAriaLabel,
      item: {
        icon: item ? <SpriteIcon spriteId={item.spriteId} /> : null,
        title: `${name} · ${action.mode.replaceAll("-", " ")}`,
        ariaLabel: `Use ${name}`,
        badge: count > 0 ? count : undefined,
        badgeTone: "count" as const,
        unavailable: count === 0,
        ...(cooldown
          ? {
              cooldownReadyAt: cooldown.readyAt,
              cooldownTotalMs: cooldown.totalMs,
            }
          : {}),
      },
    };
  });
  const visibleChatChannels: ReadonlyArray<ChatChannel> = chatChannels ?? [
    {
      id: "system",
      label: t("chat.channels.system"),
      kind: "system",
      description: t("chat.systemDescription"),
      canSend: false,
      messages: combatLog.map((body, index) => ({
        id: `combat:${index}:${body}`,
        body,
        tone: "combat",
      })),
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-tibia text-ui-text select-none">
      {battleListVisible && (
        <BattleList
          title={t("hud.battleList")}
          creatures={visibleCreatures}
          ownPlayerId={ownCharacter.id}
          attackTargetId={fightState.attackTargetId}
        />
      )}
      <div className="pointer-events-auto absolute bottom-0 left-0">
        <ChatPanel
          channels={visibleChatChannels}
          pinnedOpen={chatPinnedOpen}
          focusRequestId={chatFocusRequestId}
          draftRequest={chatDraftRequest}
          {...(chatSelectedChannelId
            ? { selectedChannelId: chatSelectedChannelId }
            : {})}
          maxMessageLength={PROTOCOL_LIMITS.maxChatTextLength}
          onChannelSelect={onChatChannelSelect}
          onChannelClose={onChatChannelClose}
          onSenderSelect={onChatSenderSelect}
          onSend={onSendChat}
          onPinnedOpenChange={onChatPinnedOpenChange}
        />
      </div>
      <div className="absolute top-24 left-4 flex flex-col items-start gap-2">
        <ConditionBar conditions={fightState.conditions} />
        {fightState.skull && <OwnSkullIndicator skull={fightState.skull} />}
      </div>
      {minimapVisible && mapName && (
        <div className="absolute right-0 bottom-0">
          <MinimapPanel
            mapName={mapName}
            ownPlayerId={ownCharacter.id}
            ownPosition={ownCharacter.position}
            creatures={visibleCreatures}
            layout={minimapLayout}
            onLayoutChange={onMinimapLayoutChange}
          />
        </div>
      )}
      <div className="absolute inset-x-2 bottom-0 flex items-end justify-center">
        <div className="ui-action-bar-dock flex w-max max-w-full items-end justify-center">
          <VitalOrb
            kind="health"
            value={ownCharacter.health}
            max={ownCharacter.maxHealth}
          />
          <div className="ui-action-cluster-shell pointer-events-auto relative z-0 min-w-0 max-w-[calc(100vw-16rem)] sm:max-w-[calc(100vw-16rem)]">
            <button
              type="button"
              title={t("actionBot.configure")}
              aria-label={t("actionBot.configure")}
              onClick={() => onConfigureActionBar(0, "bot")}
              className="ui-button ui-button-secondary absolute -top-7 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center justify-center gap-2 rounded border border-ui-stone-light/25 px-3 text-xs font-bold text-ui-muted hover:border-ui-gold/55 hover:text-ui-gold"
            >
              <span
                className={`size-2 rounded-full ${
                  actionBotEnabled
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                    : "bg-ui-stone"
                }`}
              />
              {t("actionBot.title").toLocaleUpperCase()}
            </button>
            <div className="ui-action-cluster w-max max-w-full overflow-x-auto p-2">
              <div className="flex w-max min-w-full items-end">
                <ActionBar
                  ariaLabel="Action bar"
                  slots={slots}
                  hotkeysEnabled={actionHotkeysEnabled}
                  onActivate={(slotIndex) => {
                    const action = actionBar[slotIndex]?.action;
                    if (!action) return;
                    if (action.kind === "text") {
                      if (
                        action.sendAutomatically &&
                        chatSelectedChannelId &&
                        onSendChat
                      ) {
                        onSendChat(chatSelectedChannelId, action.text);
                        return;
                      }
                      setChatDraftRequest((current) => ({
                        id: (current?.id ?? 0) + 1,
                        text: action.text,
                      }));
                      return;
                    }
                    if (action.kind === "spell") {
                      const spell = spells.find(
                        (candidate) =>
                          candidate.origin === "spell" &&
                          candidate.id === action.spellId,
                      );
                      onActivateActionBar(
                        slotIndex,
                        spell
                          ? {
                              ...action,
                              targetMode: getSpellActionTargetMode(
                                spell.targetKind,
                                action.targetMode,
                              ),
                            }
                          : action,
                      );
                      return;
                    }
                    onActivateActionBar(slotIndex, action);
                  }}
                  onConfigure={onConfigureActionBar}
                  onChangeHotkey={(slotIndex, hotkey) => {
                    const next = [...actionBar];
                    next[slotIndex] = { ...next[slotIndex]!, hotkey };
                    onActionBarChange(next);
                  }}
                  onClearAction={(slotIndex) => {
                    const next = [...actionBar];
                    next[slotIndex] = {
                      ...next[slotIndex]!,
                      action: null,
                    };
                    onActionBarChange(next);
                  }}
                  onMoveAction={(fromIndex, toIndex) => {
                    if (fromIndex === toIndex) return;
                    const next = [...actionBar];
                    const sourceAction = next[fromIndex]?.action ?? null;
                    const targetAction = next[toIndex]?.action ?? null;
                    next[fromIndex] = {
                      ...next[fromIndex]!,
                      action: targetAction,
                    };
                    next[toIndex] = {
                      ...next[toIndex]!,
                      action: sourceAction,
                    };
                    onActionBarChange(next);
                  }}
                  onDropItem={(slotIndex, itemId) => {
                    const item = inventoryItems.find(
                      (candidate) => candidate.id === itemId,
                    );
                    if (!item) return;
                    const next = [...actionBar];
                    next[slotIndex] = {
                      ...next[slotIndex]!,
                      action: createItemAction(item, spells),
                    };
                    onActionBarChange(next);
                  }}
                />
              </div>
            </div>
          </div>
          <VitalOrb
            kind="mana"
            value={ownCharacter.mana}
            max={ownCharacter.maxMana}
          />
        </div>
      </div>
    </div>
  );
}
