import { SpellBar } from "./spells/SpellBar";
import { useAppTranslation } from "../i18n/useAppTranslation";
import type {
  CombatTarget,
  CreatureState,
  FightMode,
  FightState,
  OwnCharacterState,
} from "@tibia/protocol";
import { getCombatSpells } from "../lib/combat/getCombatSpells";
import { CombatLog } from "./combat/CombatLog";
import { ConditionBar } from "./combat/ConditionBar";
import { FightControls } from "./combat/FightControls";
import { BattleList } from "./creatures/BattleList";

interface GameHudProps {
  spellHotkeysEnabled?: boolean;
  visibleCreatures: ReadonlyArray<CreatureState>;
  ownCharacter: OwnCharacterState;
  fightState: FightState;
  combatLog: ReadonlyArray<string>;
  onFightModeChange: (mode: FightMode) => void;
  onCast: (spellId: string, target: CombatTarget) => void;
}

export function GameHud({
  spellHotkeysEnabled = true,
  visibleCreatures,
  ownCharacter,
  fightState,
  combatLog,
  onFightModeChange,
  onCast,
}: GameHudProps) {
  const { t } = useAppTranslation();
  const combatSpells = getCombatSpells(ownCharacter.vocation);
  const spells = combatSpells.map((spell) => {
    const cooldown = fightState.cooldowns.find(
      (entry) => entry.group === spell.cooldownGroup,
    );
    return {
      id: spell.id,
      name: t(`spells.${spell.nameKey}`),
      glyph: spell.glyph,
      shortcut: spell.shortcut,
      manaCost: spell.manaCost,
      disabled: ownCharacter.level < spell.requiredLevel,
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
            onCast(spell.id, { kind: spell.target });
          }}
        />
        <p className="text-[10px] tracking-wider text-ui-muted/70 uppercase">
          {t("hud.controls")}
        </p>
      </div>
    </div>
  );
}
