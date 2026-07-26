"use client";

import type { TitleEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface TitlePickerProps {
  titles: ReadonlyArray<TitleEntry>;
  selectedTitle: string | null;
  pending: boolean;
  onSelectTitle: (titleId: string | null) => void;
}

/**
 * Radio list of the own titles. Ungranted titles are never selectable —
 * the server would refuse them with `not-granted` — and "no title" maps
 * to a null selection.
 */
export function TitlePicker({
  titles,
  selectedTitle,
  pending,
  onSelectTitle,
}: TitlePickerProps) {
  const { t } = useAppTranslation();

  return (
    <fieldset className="min-w-0">
      <legend className="font-display text-xs font-semibold tracking-[0.18em] text-ui-gold uppercase">
        {t("profile.titlePicker.label")}
      </legend>
      <ul className="mt-3 space-y-2">
        <li>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-ui-stone/25 bg-black/30 p-3 has-checked:border-ui-gold/60 has-checked:bg-ui-gold/5 has-disabled:cursor-default has-disabled:opacity-60">
            <input
              type="radio"
              name="profile-title"
              value=""
              checked={selectedTitle === null}
              disabled={pending}
              onChange={() => onSelectTitle(null)}
              className="accent-ui-gold"
            />
            <span className="min-w-0 flex-1 truncate text-sm text-ui-text">
              {t("profile.titlePicker.none")}
            </span>
          </label>
        </li>
        {titles.map((title) => (
          <li key={title.titleId}>
            <label
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                title.granted
                  ? "cursor-pointer border-ui-stone/25 bg-black/30 has-checked:border-ui-gold/60 has-checked:bg-ui-gold/5 has-disabled:cursor-default has-disabled:opacity-60"
                  : "cursor-default border-ui-stone-light/15 bg-black/15 opacity-60"
              }`}
            >
              <input
                type="radio"
                name="profile-title"
                value={title.titleId}
                checked={selectedTitle === title.titleId}
                disabled={!title.granted || pending}
                onChange={() => onSelectTitle(title.titleId)}
                className="accent-ui-gold"
              />
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  title.granted ? "text-ui-text-bright" : "text-ui-muted"
                }`}
              >
                {title.name}
              </span>
              {!title.granted && (
                <span className="shrink-0 rounded-sm border border-ui-stone-light/20 bg-black/25 px-1.5 py-0.5 text-xs tracking-wide text-ui-muted uppercase">
                  {t("profile.titlePicker.locked")}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
