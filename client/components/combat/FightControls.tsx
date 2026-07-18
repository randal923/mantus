import type { FightMode } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface FightControlsProps {
  mode: FightMode;
  onChange: (mode: FightMode) => void;
}

const BUTTON_CLASS =
  "ui-button group flex size-8 items-center justify-center rounded-sm border outline-none transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ui-gold/60";

const ACTIVE_BUTTON_CLASS =
  "ui-button-primary border-ui-accent-light/45 text-ui-text-bright";

const INACTIVE_BUTTON_CLASS =
  "ui-button-secondary border-ui-stone-light/10 text-ui-muted hover:border-ui-gold/30 hover:text-ui-text";

const TOOLTIP_CLASS =
  "pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded border border-ui-gold/25 bg-ui-panel-deep px-2 py-1 font-button text-xs font-normal tracking-wide text-ui-text-bright opacity-0 shadow-lg transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100";

export function FightControls({ mode, onChange }: FightControlsProps) {
  const { t } = useAppTranslation();

  return (
    <div
      role="toolbar"
      aria-label={t("combat.fightModes")}
      className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-md border border-ui-stone-light/15 bg-black/30 p-0.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.65),0_1px_0_rgba(255,255,255,0.04)]"
    >
      {(["offensive", "balanced", "defensive"] as const).map((attack) => (
        <button
          key={attack}
          type="button"
          aria-label={t(`combat.${attack}`)}
          aria-pressed={mode.attack === attack}
          onClick={() => onChange({ ...mode, attack })}
          className={`${BUTTON_CLASS} ${
            mode.attack === attack
              ? ACTIVE_BUTTON_CLASS
              : INACTIVE_BUTTON_CLASS
          }`}
        >
          {attack === "offensive" ? (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 4 14 14M19 4 5 18M7 14l-3 3M17 14l3 3M4 20l3-3M20 20l-3-3" />
              <path d="m5 4 4 1-3 3zM19 4l-4 1 3 3z" />
            </svg>
          ) : attack === "balanced" ? (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 4v16M7 20h10M5 7h14M12 4l-2 3h4z" />
              <path d="m5 7-3 6h6zM19 7l-3 6h6z" />
            </svg>
          ) : (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3 5 6v5c0 4.8 2.8 8.2 7 10 4.2-1.8 7-5.2 7-10V6z" />
              <path d="M9 9.5h6M9 13h6" />
            </svg>
          )}
          <span aria-hidden className={TOOLTIP_CLASS}>
            {t(`combat.${attack}`)}
          </span>
        </button>
      ))}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-ui-gold/20" />
      <button
        type="button"
        aria-label={t("combat.chase")}
        aria-pressed={mode.chase}
        onClick={() => onChange({ ...mode, chase: !mode.chase })}
        className={`${BUTTON_CLASS} ${
          mode.chase ? ACTIVE_BUTTON_CLASS : INACTIVE_BUTTON_CLASS
        }`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="16" cy="8" r="3" />
          <path d="M5 6H2v4M2.5 9.5A8 8 0 0 1 12 4.3M6 20l2.2-5.3 3.8-2.2 3.5 2.1 3.5 5.4M8.2 14.7 5 13l-2 3" />
        </svg>
        <span aria-hidden className={TOOLTIP_CLASS}>
          {t("combat.chase")}
        </span>
      </button>
      <button
        type="button"
        aria-label={t("combat.secureMode")}
        aria-pressed={mode.secure}
        onClick={() => onChange({ ...mode, secure: !mode.secure })}
        className={`${BUTTON_CLASS} ${
          mode.secure ? ACTIVE_BUTTON_CLASS : INACTIVE_BUTTON_CLASS
        }`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3 5 6v5c0 4.8 2.8 8.2 7 10 4.2-1.8 7-5.2 7-10V6z" />
          <rect x="9" y="10.5" width="6" height="5" rx="1" />
          <path d="M10.5 10.5V9a1.5 1.5 0 0 1 3 0v1.5" />
        </svg>
        <span aria-hidden className={TOOLTIP_CLASS}>
          {t("combat.secureMode")}
        </span>
      </button>
    </div>
  );
}
