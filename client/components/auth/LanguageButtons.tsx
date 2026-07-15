"use client";

import type { Language } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface LanguageButtonsProps {
  language: Language;
  onChange: (language: Language) => void;
  disabled?: boolean;
}

export function LanguageButtons({
  language,
  onChange,
  disabled = false,
}: LanguageButtonsProps) {
  const { t } = useAppTranslation();

  return (
    <div
      role="group"
      aria-label={t("languages.selector")}
      className="flex justify-center gap-2 font-tibia"
    >
      {(["en", "pt-BR"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={language === option}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={`ui-button rounded-md border px-4 py-2 text-sm font-medium transition-[border-color,color,filter] hover:brightness-110 disabled:pointer-events-none disabled:opacity-40 ${
            language === option
              ? "ui-button-primary border-ui-accent-light text-ui-text-bright"
              : "ui-button-secondary border-ui-stone-light/20 text-ui-muted hover:border-ui-gold/45 hover:text-ui-text"
          }`}
        >
          {t(`languages.${option}`)}
        </button>
      ))}
    </div>
  );
}
