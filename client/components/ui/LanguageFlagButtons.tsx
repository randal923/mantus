"use client";

import type { Language } from "@tibia/protocol";
import type { ComponentType } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { BrazilFlag } from "./BrazilFlag";
import { UsaFlag } from "./UsaFlag";

interface LanguageFlagButtonsProps {
  language: Language;
  onChange: (language: Language) => void;
  disabled?: boolean;
}

const FLAG_OPTIONS: ReadonlyArray<{
  value: Language;
  Flag: ComponentType<{ className?: string }>;
}> = [
  { value: "en", Flag: UsaFlag },
  { value: "pt-BR", Flag: BrazilFlag },
];

export function LanguageFlagButtons({
  language,
  onChange,
  disabled = false,
}: LanguageFlagButtonsProps) {
  const { t } = useAppTranslation();

  return (
    <div
      role="group"
      aria-label={t("languages.selector")}
      className="flex items-center gap-2"
    >
      {FLAG_OPTIONS.map(({ value, Flag }) => (
        <button
          key={value}
          type="button"
          aria-pressed={language === value}
          aria-label={t(`languages.${value}`)}
          title={t(`languages.${value}`)}
          disabled={disabled}
          onClick={() => onChange(value)}
          className={`rounded-xs border p-0.5 outline-none transition-[border-color,opacity,filter] duration-150 focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-40 ${
            language === value
              ? "border-ui-gold/70"
              : "border-ui-stone-light/20 opacity-50 saturate-50 hover:opacity-90 hover:saturate-100"
          }`}
        >
          <Flag className="block h-3.5 w-[1.3125rem] rounded-[1px]" />
        </button>
      ))}
    </div>
  );
}
