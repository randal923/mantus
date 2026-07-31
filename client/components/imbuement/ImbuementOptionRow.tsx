"use client";

import type { ImbuementOption } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ImbuementIcon } from "./ImbuementIcon";

interface ImbuementOptionRowProps {
  option: ImbuementOption;
  selected: boolean;
  onSelect: () => void;
}

/**
 * One imbuement in the selection list. Blocked options stay in place and
 * explain themselves, the way Tibia greys out an imbuement the item cannot
 * take instead of hiding it.
 */
export function ImbuementOptionRow({
  option,
  selected,
  onSelect,
}: ImbuementOptionRowProps) {
  const { t } = useAppTranslation();
  const blocked = option.blockedReason
    ? t(`imbuement.blocked.${option.blockedReason}`, {
        defaultValue: t("imbuement.blocked.insufficient-materials"),
      })
    : null;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={blocked ?? option.description}
        className={`flex w-full min-w-0 items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors ${
          selected
            ? "border-ui-gold/60 bg-ui-gold/10"
            : "border-transparent hover:border-ui-stone-light/25 hover:bg-black/30"
        } ${option.canApply ? "" : "opacity-45"}`}
      >
        <ImbuementIcon iconId={option.iconId} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base text-ui-text-bright">
            {option.name}
          </span>
          {blocked && (
            <span className="block truncate text-sm text-ui-accent-light">
              {blocked}
            </span>
          )}
        </span>
        {option.premium && (
          <span className="shrink-0 rounded-sm border border-ui-gold/40 bg-ui-gold/10 px-1.5 py-0.5 text-sm text-ui-gold">
            {t("imbuement.premium")}
          </span>
        )}
      </button>
    </li>
  );
}
