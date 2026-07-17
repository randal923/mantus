import { SpellBar } from "./spells/SpellBar";
import { useAppTranslation } from "../i18n/useAppTranslation";
import type {
  CombatTarget,
  CreatureState,
  FightMode,
  FightState,
  OwnCharacterState,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { CombatLog } from "./combat/CombatLog";
import { ConditionBar } from "./combat/ConditionBar";
import { FightControls } from "./combat/FightControls";
import { BattleList } from "./creatures/BattleList";
import { getSpellCombatTarget } from "../lib/combat/getSpellCombatTarget";
import { getSpellGlyph } from "../lib/combat/getSpellGlyph";

interface GameHudProps {
  spellHotkeysEnabled?: boolean;
  visibleCreatures: ReadonlyArray<CreatureState>;
  ownCharacter: OwnCharacterState;
  fightState: FightState;
  spells: ReadonlyArray<SpellCatalogEntry>;
  hasWeapon: boolean;
  combatLog: ReadonlyArray<string>;
  onFightModeChange: (mode: FightMode) => void;
  onCast: (spellId: string, target: CombatTarget) => void;
}

export function GameHud({
  spellHotkeysEnabled = true,
  visibleCreatures,
  ownCharacter,
  fightState,
  spells: spellCatalog,
  hasWeapon,
  combatLog,
  onFightModeChange,
  onCast,
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
      effectId: spell.effectId,
      glyph: getSpellGlyph(spell.damageType),
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

  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-tibia text-ui-text select-none">
      <BattleList
        title={t("hud.battleList")}
        creatures={visibleCreatures}
        ownPlayerId={ownCharacter.id}
        attackTargetId={fightState.attackTargetId}
      />
      <CombatLog entries={combatLog} />
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
