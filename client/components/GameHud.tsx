import { SpellBar } from "./spells/SpellBar";
import { useAppTranslation } from "../i18n/useAppTranslation";
import {
  ACTION_BAR_SLOT_COUNT,
  PROTOCOL_LIMITS,
  type ActionBar,
  type CombatTarget,
  type CreatureState,
  type FightState,
  type MinimapLayout,
  type OwnCharacterState,
  type SpellCatalogEntry,
} from "@tibia/protocol";
import { ChatPanel } from "./chat/ChatPanel";
import type { ChatChannel } from "./chat/chatTypes";
import { ConditionBar } from "./combat/ConditionBar";
import { OwnSkullIndicator } from "./pvp/OwnSkullIndicator";
import { BattleList } from "./creatures/BattleList";
import { MinimapPanel } from "./minimap/MinimapPanel";
import { getSpellCombatTarget } from "../lib/combat/getSpellCombatTarget";

interface GameHudProps {
  spellHotkeysEnabled?: boolean;
  battleListVisible: boolean;
  minimapVisible: boolean;
  mapName: string | null;
  minimapLayout: MinimapLayout | null;
  onMinimapLayoutChange: (layout: MinimapLayout) => void;
  visibleCreatures: ReadonlyArray<CreatureState>;
  ownCharacter: OwnCharacterState;
  fightState: FightState;
  spells: ReadonlyArray<SpellCatalogEntry>;
  actionBar: ActionBar;
  hasWeapon: boolean;
  combatLog: ReadonlyArray<string>;
  chatChannels?: ReadonlyArray<ChatChannel>;
  chatSelectedChannelId?: string;
  onCast: (spellId: string, target: CombatTarget) => void;
  onConfigureActionBar: (slotIndex: number) => void;
  onChatChannelSelect?: (channelId: string) => void;
  onChatChannelClose?: (channelId: string) => void;
  onChatSenderSelect?: (sender: string) => void;
  onSendChat?: (channelId: string, body: string) => void;
}

export function GameHud({
  spellHotkeysEnabled = true,
  battleListVisible,
  minimapVisible,
  mapName,
  minimapLayout,
  onMinimapLayoutChange,
  visibleCreatures,
  ownCharacter,
  fightState,
  spells: spellCatalog,
  actionBar,
  hasWeapon,
  combatLog,
  chatChannels,
  chatSelectedChannelId,
  onCast,
  onConfigureActionBar,
  onChatChannelSelect,
  onChatChannelClose,
  onChatSenderSelect,
  onSendChat,
}: GameHudProps) {
  const { t } = useAppTranslation();
  const combatSpells = spellCatalog.filter(
    (spell) => spell.origin === "spell",
  );
  const slots = Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, index) => {
    const spellId = actionBar[index] ?? null;
    const spell = spellId
      ? combatSpells.find((candidate) => candidate.id === spellId)
      : undefined;
    const shortcut = String(index + 1);
    if (!spell) return { shortcut, spell: null };
    const cooldown = fightState.cooldowns
      .filter((entry) => spell.cooldownGroups.includes(entry.group))
      .sort((left, right) => right.readyAt - left.readyAt)[0];
    return {
      shortcut,
      spell: {
        id: spell.id,
        name: spell.name,
        manaCost: spell.manaCost,
        disabled:
          ownCharacter.level < spell.requiredLevel ||
          ownCharacter.magicLevel < spell.requiredMagicLevel ||
          ownCharacter.mana < spell.manaCost ||
          ownCharacter.soul < spell.soulCost ||
          (spell.needWeapon && !hasWeapon) ||
          spell.targetKind === "position",
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
      <div className="pointer-events-auto absolute bottom-4 left-4">
        <ChatPanel
          channels={visibleChatChannels}
          {...(chatSelectedChannelId
            ? { selectedChannelId: chatSelectedChannelId }
            : {})}
          hotkeysEnabled={spellHotkeysEnabled}
          maxMessageLength={PROTOCOL_LIMITS.maxChatTextLength}
          onChannelSelect={onChatChannelSelect}
          onChannelClose={onChatChannelClose}
          onSenderSelect={onChatSenderSelect}
          onSend={onSendChat}
        />
      </div>
      <div className="absolute top-24 left-4 flex flex-col items-start gap-2">
        <ConditionBar conditions={fightState.conditions} />
        {fightState.skull && <OwnSkullIndicator skull={fightState.skull} />}
      </div>
      {minimapVisible && mapName && (
        <div
          className={
            minimapLayout ? "absolute" : "absolute right-4 bottom-4"
          }
          style={
            minimapLayout
              ? {
                  // Clamp so a layout saved on a larger screen stays reachable.
                  left:
                    typeof window === "undefined"
                      ? minimapLayout.x
                      : Math.min(
                          minimapLayout.x,
                          Math.max(0, window.innerWidth - 240),
                        ),
                  top:
                    typeof window === "undefined"
                      ? minimapLayout.y
                      : Math.min(
                          minimapLayout.y,
                          Math.max(0, window.innerHeight - 160),
                        ),
                }
              : undefined
          }
        >
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
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <SpellBar
          slots={slots}
          hotkeysEnabled={spellHotkeysEnabled}
          onCast={(spellId) => {
            const spell = combatSpells.find(
              (candidate) => candidate.id === spellId,
            );
            if (!spell) return;
            onCast(
              spell.id,
              getSpellCombatTarget(spell, fightState.attackTargetId),
            );
          }}
          onConfigure={onConfigureActionBar}
        />
      </div>
    </div>
  );
}
