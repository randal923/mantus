import { SpellBar } from "./spells/SpellBar";
import { useAppTranslation } from "../i18n/useAppTranslation";
import {
  PROTOCOL_LIMITS,
  type CombatTarget,
  type CreatureState,
  type FightMode,
  type FightState,
  type OwnCharacterState,
  type SpellCatalogEntry,
} from "@tibia/protocol";
import { ChatPanel } from "./chat/ChatPanel";
import type { ChatChannel } from "./chat/chatTypes";
import { ConditionBar } from "./combat/ConditionBar";
import { FightControls } from "./combat/FightControls";
import { BattleList } from "./creatures/BattleList";
import { getSpellCombatTarget } from "../lib/combat/getSpellCombatTarget";

interface GameHudProps {
  spellHotkeysEnabled?: boolean;
  visibleCreatures: ReadonlyArray<CreatureState>;
  ownCharacter: OwnCharacterState;
  fightState: FightState;
  spells: ReadonlyArray<SpellCatalogEntry>;
  hasWeapon: boolean;
  combatLog: ReadonlyArray<string>;
  chatChannels?: ReadonlyArray<ChatChannel>;
  chatSelectedChannelId?: string;
  onFightModeChange: (mode: FightMode) => void;
  onCast: (spellId: string, target: CombatTarget) => void;
  onChatChannelSelect?: (channelId: string) => void;
  onChatChannelClose?: (channelId: string) => void;
  onChatSenderSelect?: (sender: string) => void;
  onSendChat?: (channelId: string, body: string) => void;
}

export function GameHud({
  spellHotkeysEnabled = true,
  visibleCreatures,
  ownCharacter,
  fightState,
  spells: spellCatalog,
  hasWeapon,
  combatLog,
  chatChannels,
  chatSelectedChannelId,
  onFightModeChange,
  onCast,
  onChatChannelSelect,
  onChatChannelClose,
  onChatSenderSelect,
  onSendChat,
}: GameHudProps) {
  const { t } = useAppTranslation();
  const combatSpells = spellCatalog
    .filter((spell) => spell.origin === "spell")
    .slice(0, 9);
  const spells = combatSpells.map((spell, index) => {
    const cooldown = fightState.cooldowns
      .filter((entry) => spell.cooldownGroups.includes(entry.group))
      .sort((left, right) => right.readyAt - left.readyAt)[0];
    return {
      id: spell.id,
      name: spell.name,
      shortcut: String(index + 1),
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
      <BattleList
        title={t("hud.battleList")}
        creatures={visibleCreatures}
        ownPlayerId={ownCharacter.id}
        attackTargetId={fightState.attackTargetId}
      />
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
        <FightControls mode={fightState.mode} onChange={onFightModeChange} />
      </div>
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <SpellBar
          spells={spells}
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
        />
      </div>
    </div>
  );
}
