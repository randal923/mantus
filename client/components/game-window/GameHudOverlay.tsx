import {
  GUILD_CHANNEL_ID,
  LOCAL_CHANNEL_ID,
  PARTY_CHANNEL_ID,
  SYSTEM_CHANNEL_ID,
} from "../../lib/chat/chatReducer";
import { parseChatInput } from "../../lib/chat/parseChatInput";
import { sanitizeChatText } from "../../lib/chat/sanitizeChatText";
import { toChatMessage } from "../../lib/chat/toChatMessage";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { GameHud } from "../GameHud";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameHudOverlay() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const gameMenuOpen = useGameWindowStore((state) => state.gameMenuOpen);
  const characterStatsOpen = useGameWindowStore(
    (state) => state.characterStatsOpen,
  );
  const potionTargeting = useGameWindowStore(
    (state) => state.potionTargeting,
  );
  const actionBarConfigSlot = useGameWindowStore(
    (state) => state.actionBarConfigSlot,
  );
  const potionActionBarConfigSlot = useGameWindowStore(
    (state) => state.potionActionBarConfigSlot,
  );
  const battleListVisible = useGameWindowStore(
    (state) => state.battleListVisible,
  );
  const minimapVisible = useGameWindowStore((state) => state.minimapVisible);
  const mapName = useGameWindowStore((state) => state.mapName);
  const uiSettings = useGameWindowStore((state) => state.uiSettings);
  const visibleCreatures = useGameWindowStore(
    (state) => state.visibleCreatures,
  );
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const fightState = useGameWindowStore((state) => state.fightState);
  const spells = useGameWindowStore((state) => state.spells);
  const actionBar = useGameWindowStore((state) => state.actionBar);
  const potionActionBar = useGameWindowStore(
    (state) => state.potionActionBar,
  );
  const inventory = useGameWindowStore(
    (state) => state.sessions?.inventory ?? null,
  );
  const combatLog = useGameWindowStore((state) => state.combatLog);
  const chatState = useGameWindowStore((state) => state.chatState);
  const dispatchChat = useGameWindowStore((state) => state.dispatchChat);
  const setUiSettings = useGameWindowStore((state) => state.setUiSettings);
  const setReportSession = useGameWindowStore(
    (state) => state.setReportSession,
  );
  const setRuneTargeting = useGameWindowStore(
    (state) => state.setRuneTargeting,
  );
  const setPotionTargeting = useGameWindowStore(
    (state) => state.setPotionTargeting,
  );
  const setActionBarConfigSlot = useGameWindowStore(
    (state) => state.setActionBarConfigSlot,
  );
  const setPotionActionBarConfigSlot = useGameWindowStore(
    (state) => state.setPotionActionBarConfigSlot,
  );
  if (!ownCharacter || !fightState) return null;

  const onMinimapLayoutChange = (layout: typeof uiSettings.minimap) => {
    if (!layout) return;
    const runtime = store.getState().runtime;
    const next = { ...runtime.uiSettingsRef.current, minimap: layout };
    runtime.uiSettingsRef.current = next;
    setUiSettings(next);
    if (runtime.uiSettingsSaveTimerRef.current) {
      clearTimeout(runtime.uiSettingsSaveTimerRef.current);
    }
    runtime.uiSettingsSaveTimerRef.current = setTimeout(() => {
      runtime.uiSettingsSaveTimerRef.current = null;
      runtime.clientRef.current?.updateUiSettings(
        runtime.uiSettingsRef.current,
      );
    }, 800);
  };
  const onChatPinnedOpenChange = (chatPinnedOpen: boolean) => {
    const runtime = store.getState().runtime;
    const next = { ...runtime.uiSettingsRef.current, chatPinnedOpen };
    runtime.uiSettingsRef.current = next;
    setUiSettings(next);
    if (runtime.uiSettingsSaveTimerRef.current) {
      clearTimeout(runtime.uiSettingsSaveTimerRef.current);
    }
    runtime.uiSettingsSaveTimerRef.current = setTimeout(() => {
      runtime.uiSettingsSaveTimerRef.current = null;
      runtime.clientRef.current?.updateUiSettings(
        runtime.uiSettingsRef.current,
      );
    }, 800);
  };

  return (
    <GameHud
      spellHotkeysEnabled={
        !gameMenuOpen &&
        !characterStatsOpen &&
        !potionTargeting &&
        actionBarConfigSlot === null &&
        potionActionBarConfigSlot === null
      }
      battleListVisible={battleListVisible}
      minimapVisible={minimapVisible}
      mapName={mapName}
      minimapLayout={uiSettings.minimap ?? null}
      onMinimapLayoutChange={onMinimapLayoutChange}
      visibleCreatures={visibleCreatures}
      ownCharacter={ownCharacter}
      fightState={fightState}
      spells={spells}
      actionBar={actionBar}
      potionActionBar={potionActionBar}
      inventory={inventory}
      hasWeapon={Boolean(inventory?.equipment.weapon)}
      combatLog={combatLog}
      chatPinnedOpen={uiSettings.chatPinnedOpen ?? false}
      chatChannels={[
        ...chatState.channels.map((channel) => ({
          id: channel.id,
          label:
            channel.kind === "party"
              ? t("chat.channels.party")
              : channel.kind === "guild"
                ? t("chat.channels.guild")
                : (channel.counterpart ?? t("chat.channels.local")),
          kind: channel.kind,
          canSend: true,
          closable: channel.kind === "whisper",
          unreadCount: channel.unreadCount,
          messages: channel.entries.map((entry) => toChatMessage(entry, t)),
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
      onChatPinnedOpenChange={onChatPinnedOpenChange}
      onSendChat={(channelId, body) => {
        const client = store.getState().runtime.clientRef.current;
        if (channelId === PARTY_CHANNEL_ID) {
          const text = sanitizeChatText(body);
          if (text.length > 0) client?.sendPartyChat(text);
          return;
        }
        if (channelId === GUILD_CHANNEL_ID) {
          const text = sanitizeChatText(body);
          if (text.length > 0) client?.sendGuildChat(text);
          return;
        }
        if (channelId === LOCAL_CHANNEL_ID) {
          const sanitized = sanitizeChatText(body);
          if (sanitized.toLowerCase().startsWith("/p ")) {
            const partyText = sanitized.slice(3).trim();
            if (partyText.length > 0) {
              client?.sendPartyChat(partyText);
            }
            return;
          }
          if (sanitized.toLowerCase().startsWith("/g ")) {
            const guildText = sanitized.slice(3).trim();
            if (guildText.length > 0) {
              client?.sendGuildChat(guildText);
            }
            return;
          }
          if (sanitized.toLowerCase().startsWith("/report")) {
            setReportSession({
              targetName: sanitized.slice(7).trim(),
              pending: false,
              error: null,
              sent: false,
            });
            return;
          }
          const { mode, text } = parseChatInput(body);
          if (text.length > 0) client?.speak(mode, text);
          return;
        }
        const channel = chatState.channels.find(
          (candidate) => candidate.id === channelId,
        );
        if (!channel?.counterpart) return;
        const text = sanitizeChatText(body);
        if (text.length === 0) return;
        client?.sendPrivateChat(channel.counterpart, text);
      }}
      onCast={(spellId, target) =>
        store.getState().runtime.clientRef.current?.castSpell(spellId, target)
      }
      onActivatePotion={(item, targetMode) => {
        const runtime = store.getState().runtime;
        runtime.pendingRuneRef.current = null;
        setRuneTargeting(false);
        runtime.pendingPotionRef.current = null;
        setPotionTargeting(false);

        const targetId =
          targetMode === "self"
            ? ownCharacter.id
            : targetMode === "attack-target"
              ? fightState.attackTargetId
              : targetMode === "cursor"
                ? runtime.rendererRef.current?.creatureIdAtCursor()
                : null;
        const target = targetId
          ? visibleCreatures.find((candidate) => candidate.id === targetId)
          : undefined;
        if (
          targetId &&
          (targetId === ownCharacter.id || target?.kind === "player")
        ) {
          runtime.clientRef.current?.usePotion(item, targetId);
          return;
        }

        runtime.pendingPotionRef.current = item;
        setPotionTargeting(true);
      }}
      onConfigureActionBar={(slotIndex) => {
        setPotionActionBarConfigSlot(null);
        setActionBarConfigSlot(slotIndex);
      }}
      onConfigurePotionActionBar={(slotIndex) => {
        setActionBarConfigSlot(null);
        setPotionActionBarConfigSlot(slotIndex);
      }}
    />
  );
}
