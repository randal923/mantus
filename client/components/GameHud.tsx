import { ActionBar } from "./action-bar/ActionBar";
import { VitalOrb } from "./action-bar/VitalOrb";
import { useAppTranslation } from "../i18n/useAppTranslation";
import {
  ACTION_BAR_SLOT_COUNT,
  PROTOCOL_LIMITS,
  type ActionBar as ActionBarState,
  type CombatTarget,
  type CreatureState,
  type FightState,
  type InventoryItem,
  type InventoryState,
  type MinimapLayout,
  type OwnCharacterState,
  type PotionActionBar,
  type PotionTargetMode,
  type SpellCatalogEntry,
} from "@tibia/protocol";
import { ChatPanel } from "./chat/ChatPanel";
import type { ChatChannel } from "./chat/chatTypes";
import { ConditionBar } from "./combat/ConditionBar";
import { OwnSkullIndicator } from "./pvp/OwnSkullIndicator";
import { BattleList } from "./creatures/BattleList";
import { MinimapPanel } from "./minimap/MinimapPanel";
import { getSpellCombatTarget } from "../lib/combat/getSpellCombatTarget";
import { getSpellIconArtwork } from "../lib/combat/getSpellIconArtwork";
import { getPotionBarItems } from "../lib/inventory/getPotionBarItems";
import { getEffectivePotionActionBar } from "../lib/inventory/getEffectivePotionActionBar";
import { SpriteIcon } from "./inventory/SpriteIcon";
import { SpellIcon } from "./spells/SpellIcon";

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
  actionBar: ActionBarState;
  potionActionBar: PotionActionBar;
  inventory: InventoryState | null;
  hasWeapon: boolean;
  combatLog: ReadonlyArray<string>;
  chatPinnedOpen: boolean;
  chatChannels?: ReadonlyArray<ChatChannel>;
  chatSelectedChannelId?: string;
  onCast: (spellId: string, target: CombatTarget) => void;
  onActivatePotion: (
    item: InventoryItem,
    targetMode: PotionTargetMode,
  ) => void;
  onConfigureActionBar: (slotIndex: number) => void;
  onConfigurePotionActionBar: (slotIndex: number) => void;
  onChatChannelSelect?: (channelId: string) => void;
  onChatChannelClose?: (channelId: string) => void;
  onChatSenderSelect?: (sender: string) => void;
  onSendChat?: (channelId: string, body: string) => void;
  onChatPinnedOpenChange: (pinnedOpen: boolean) => void;
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
  potionActionBar,
  inventory,
  hasWeapon,
  combatLog,
  chatPinnedOpen,
  chatChannels,
  chatSelectedChannelId,
  onCast,
  onActivatePotion,
  onConfigureActionBar,
  onConfigurePotionActionBar,
  onChatChannelSelect,
  onChatChannelClose,
  onChatSenderSelect,
  onSendChat,
  onChatPinnedOpenChange,
}: GameHudProps) {
  const { t } = useAppTranslation();
  const combatSpells = spellCatalog.filter(
    (spell) => spell.origin === "spell",
  );
  const spellSlots = Array.from(
    { length: ACTION_BAR_SLOT_COUNT },
    (_, index) => {
      const spellId = actionBar[index] ?? null;
      const spell = spellId
        ? combatSpells.find((candidate) => candidate.id === spellId)
        : undefined;
      const shortcut = String(index + 1);
      const emptyTitle = t("spells.actionBar.emptySlotHint");
      const emptyAriaLabel = t("spells.actionBar.emptySlot", { shortcut });
      if (!spell) {
        return {
          shortcut,
          shortcutLabel: shortcut,
          emptyTitle,
          emptyAriaLabel,
          item: null,
        };
      }
      const cooldown = fightState.cooldowns
        .filter((entry) => spell.cooldownGroups.includes(entry.group))
        .sort((left, right) => right.readyAt - left.readyAt)[0];
      const iconArtwork = getSpellIconArtwork(spell.id);
      const label = t("spells.shortcut", {
        name: spell.name,
        shortcut,
      });
      return {
        shortcut,
        shortcutLabel: shortcut,
        emptyTitle,
        emptyAriaLabel,
        item: {
          id: spell.id,
          icon: iconArtwork ? <SpellIcon {...iconArtwork} /> : null,
          title: label,
          ariaLabel: label,
          badge: spell.manaCost,
          badgeTone: "mana" as const,
          unavailable:
            ownCharacter.level < spell.requiredLevel ||
            ownCharacter.magicLevel < spell.requiredMagicLevel ||
            ownCharacter.mana < spell.manaCost ||
            ownCharacter.soul < spell.soulCost ||
            (spell.needWeapon && !hasWeapon),
          disabled: spell.targetKind === "position",
          ...(cooldown
            ? {
                cooldownReadyAt: cooldown.readyAt,
                cooldownTotalMs: cooldown.totalMs,
              }
            : {}),
        },
      };
    },
  );
  const potionItems = getPotionBarItems(inventory);
  const potionCooldown = fightState.cooldowns.find(
    (cooldown) => cooldown.group === "potion",
  );
  const potionConfiguration = getEffectivePotionActionBar(
    potionActionBar,
    potionItems,
  );
  const potionSlots = Array.from(
    { length: ACTION_BAR_SLOT_COUNT },
    (_, index) => {
      const configuration = potionConfiguration[index];
      const potion = configuration
        ? potionItems.find(
            (candidate) =>
              candidate.item.typeId === configuration.itemTypeId,
          )
        : undefined;
      const shortcut = `Shift+${index + 1}`;
      const emptyLabel = t("potions.emptySlot", { shortcut });
      if (!configuration || !potion) {
        return {
          shortcut,
          shortcutLabel: `⇧${index + 1}`,
          emptyTitle: emptyLabel,
          emptyAriaLabel: emptyLabel,
          item: null,
        };
      }
      const label = t("potions.actionBar.use", {
        name: potion.item.name,
        count: potion.count,
        shortcut,
        mode: t(`potions.actionBar.mode.${configuration.targetMode}`),
      });
      return {
        shortcut,
        shortcutLabel: `⇧${index + 1}`,
        emptyTitle: emptyLabel,
        emptyAriaLabel: emptyLabel,
        item: {
          id: potion.item.id,
          icon: <SpriteIcon spriteId={potion.item.spriteId} />,
          title: label,
          ariaLabel: label,
          badge: potion.count,
          badgeTone: "count" as const,
          ...(potionCooldown
            ? {
                cooldownReadyAt: potionCooldown.readyAt,
                cooldownTotalMs: potionCooldown.totalMs,
              }
            : {}),
        },
      };
    },
  );
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
      <div className="pointer-events-auto absolute bottom-0 left-4">
        <ChatPanel
          channels={visibleChatChannels}
          pinnedOpen={chatPinnedOpen}
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
      <div className="absolute inset-x-2 bottom-0 flex items-end justify-center">
        <div className="flex w-max max-w-full items-end justify-center">
          <VitalOrb
            kind="health"
            value={ownCharacter.health}
            max={ownCharacter.maxHealth}
          />

          <div className="ui-action-cluster-shell pointer-events-auto relative z-0 min-w-0 max-w-[calc(100vw-12rem)] sm:max-w-[calc(100vw-16rem)]">
            <div className="ui-action-cluster w-max max-w-full overflow-x-auto p-2">
              <div className="flex w-max min-w-full flex-col items-center gap-1">
                <ActionBar
                  ariaLabel={t("potions.bar")}
                  slots={potionSlots}
                  hotkeyModifier="shift"
                  hotkeysEnabled={spellHotkeysEnabled}
                  onActivate={(itemId, slotIndex) => {
                    const potion = potionItems.find(
                      (candidate) => candidate.item.id === itemId,
                    );
                    const targetMode =
                      potionConfiguration[slotIndex]?.targetMode;
                    if (potion && targetMode) {
                      onActivatePotion(potion.item, targetMode);
                    }
                  }}
                  onConfigure={onConfigurePotionActionBar}
                />
                <ActionBar
                  ariaLabel={t("spells.bar")}
                  slots={spellSlots}
                  hotkeysEnabled={spellHotkeysEnabled}
                  onActivate={(spellId) => {
                    const spell = combatSpells.find(
                      (candidate) => candidate.id === spellId,
                    );
                    if (!spell) return;
                    onCast(
                      spell.id,
                      getSpellCombatTarget(
                        spell,
                        fightState.attackTargetId,
                      ),
                    );
                  }}
                  onConfigure={onConfigureActionBar}
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
