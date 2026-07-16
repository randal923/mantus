import type { FightMode } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface FightControlsProps {
  mode: FightMode;
  onChange: (mode: FightMode) => void;
}

export function FightControls({ mode, onChange }: FightControlsProps) {
  const { t } = useAppTranslation();

  return (
    <div
      role="toolbar"
      aria-label={t("combat.fightModes")}
      className="ui-panel-frame pointer-events-auto flex items-center gap-1 p-1.5"
    >
      {(["offensive", "balanced", "defensive"] as const).map((attack) => (
        <button
          key={attack}
          type="button"
          aria-pressed={mode.attack === attack}
          title={t(`combat.${attack}`)}
          onClick={() => onChange({ ...mode, attack })}
          className={`ui-button flex size-8 items-center justify-center rounded text-sm ${
            mode.attack === attack
              ? "ui-button-primary text-ui-text-bright"
              : "ui-button-secondary text-ui-muted"
          }`}
        >
          {attack === "offensive" ? "⚔" : attack === "balanced" ? "◈" : "◆"}
        </button>
      ))}
      <span aria-hidden className="mx-1 h-6 w-px bg-ui-gold/20" />
      <button
        type="button"
        aria-pressed={mode.chase}
        title={t("combat.chase")}
        onClick={() => onChange({ ...mode, chase: !mode.chase })}
        className={`ui-button flex size-8 items-center justify-center rounded text-sm ${
          mode.chase
            ? "ui-button-primary text-ui-text-bright"
            : "ui-button-secondary text-ui-muted"
        }`}
      >
        ➜
      </button>
      <button
        type="button"
        aria-pressed={mode.secure}
        title={t("combat.secureMode")}
        onClick={() => onChange({ ...mode, secure: !mode.secure })}
        className={`ui-button flex size-8 items-center justify-center rounded text-sm ${
          mode.secure
            ? "ui-button-primary text-ui-text-bright"
            : "ui-button-secondary text-ui-muted"
        }`}
      >
        ⛨
      </button>
    </div>
  );
}
