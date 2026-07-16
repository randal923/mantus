import { SpellBar } from "./spells/SpellBar";
import { useAppTranslation } from "../i18n/useAppTranslation";
import type { CreatureState } from "@tibia/protocol";
import { BattleList } from "./creatures/BattleList";

interface GameHudProps {
  spellHotkeysEnabled?: boolean;
  visibleCreatures: ReadonlyArray<CreatureState>;
  ownPlayerId: string;
}

export function GameHud({
  spellHotkeysEnabled = true,
  visibleCreatures,
  ownPlayerId,
}: GameHudProps) {
  const { t } = useAppTranslation();
  const spells = [
    {
      id: "light-healing",
      name: t("spells.lightHealing"),
      glyph: "✚",
      shortcut: "1",
      manaCost: 20,
    },
    {
      id: "energy-strike",
      name: t("spells.energyStrike"),
      glyph: "ϟ",
      shortcut: "2",
      manaCost: 35,
    },
    {
      id: "ice-wave",
      name: t("spells.iceWave"),
      glyph: "❄",
      shortcut: "3",
      manaCost: 55,
    },
    {
      id: "fire-bomb",
      name: t("spells.fireBomb"),
      glyph: "✦",
      shortcut: "4",
      manaCost: 85,
      cooldownRemaining: 3,
      cooldownTotal: 6,
    },
    {
      id: "haste",
      name: t("spells.haste"),
      glyph: "»",
      shortcut: "5",
      manaCost: 60,
    },
    {
      id: "magic-shield",
      name: t("spells.magicShield"),
      glyph: "◇",
      shortcut: "6",
      manaCost: 50,
    },
    {
      id: "ultimate-healing",
      name: t("spells.ultimateHealing"),
      glyph: "✥",
      shortcut: "7",
      manaCost: 160,
    },
    {
      id: "empty-slot",
      name: t("spells.emptySlot"),
      glyph: "",
      shortcut: "8",
      disabled: true,
    },
  ] as const;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-tibia text-ui-text select-none">
      <BattleList
        title={t("hud.battleList")}
        creatures={visibleCreatures}
        ownPlayerId={ownPlayerId}
      />
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <SpellBar
          spells={spells}
          hotkeysEnabled={spellHotkeysEnabled}
          onCast={() => undefined}
        />
        <p className="text-[10px] tracking-wider text-ui-muted/70 uppercase">
          {t("hud.controls")}
        </p>
      </div>
    </div>
  );
}
