"use client";

import type { CyclopediaItemCount } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import type { WikiItem } from "../../lib/wiki/WikiItem";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface WikiCharacterItemSectionProps {
  title: string;
  entries: ReadonlyArray<CyclopediaItemCount>;
  /** Wiki catalog lookup for sprites and display names. */
  itemsById: ReadonlyMap<number, WikiItem>;
}

/** One storage area of the server's own-item summary (type/tier/count). */
export function WikiCharacterItemSection({
  title,
  entries,
  itemsById,
}: WikiCharacterItemSectionProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);

  return (
    <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
      <h4 className="flex items-baseline justify-between gap-2 font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
        {title}
        <span className="font-normal tracking-normal text-ui-muted normal-case">
          {t("wiki.character.items.count", {
            count: entries.length.toLocaleString(language),
          })}
        </span>
      </h4>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ui-muted">
          {t("wiki.character.items.empty")}
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {entries.map((entry) => {
            const item = itemsById.get(entry.itemTypeId);
            return (
              <li
                key={`${entry.itemTypeId}-${entry.tier}`}
                className="flex items-center gap-2 rounded-sm border border-ui-stone-light/10 bg-black/20 px-2 py-1.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-ui-stone-light/15 bg-black/30">
                  {item ? (
                    <SpriteIcon spriteId={item.spriteId} scale={1} />
                  ) : (
                    <span aria-hidden className="text-xs text-ui-muted">
                      ?
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ui-text/85 capitalize">
                  {item?.name ?? `#${entry.itemTypeId}`}
                </span>
                {entry.tier > 0 && (
                  <span className="shrink-0 rounded-sm border border-ui-gold/40 bg-ui-gold-deep/40 px-1.5 py-0.5 text-xs font-bold text-ui-gold">
                    {t("wiki.character.items.tier", { tier: entry.tier })}
                  </span>
                )}
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ui-text-bright">
                  ×{entry.count.toLocaleString(language)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
