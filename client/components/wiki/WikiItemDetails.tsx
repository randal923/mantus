"use client";

import type { WikiItemSource } from "@tibia/protocol";
import type { WikiItem } from "../../lib/wiki/WikiItem";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { CloseButton } from "../ui/CloseButton";
import { WikiItemSourceCard } from "./WikiItemSourceCard";

interface WikiItemDetailsProps {
  item: WikiItem;
  sources: ReadonlyArray<WikiItemSource>;
  sourcesPending: boolean;
  onSelectSource: (source: WikiItemSource) => void;
  onClose: () => void;
}

export function WikiItemDetails({
  item,
  sources,
  sourcesPending,
  onSelectSource,
  onClose,
}: WikiItemDetailsProps) {
  const { t } = useAppTranslation();
  const stats = [
    { label: t("wiki.items.stats.attack"), value: item.attack },
    { label: t("wiki.items.stats.defense"), value: item.defense },
    { label: t("wiki.items.stats.extraDefense"), value: item.extraDefense },
    { label: t("wiki.items.stats.armor"), value: item.armor },
    { label: t("wiki.items.stats.range"), value: item.range },
    { label: t("wiki.items.stats.hitChance"), value: item.hitChance },
    { label: t("wiki.items.stats.manaCost"), value: item.manaCost },
    {
      label: t("wiki.items.stats.damage"),
      value:
        item.minimumDamage !== undefined && item.maximumDamage !== undefined
          ? `${item.minimumDamage}–${item.maximumDamage}`
          : undefined,
    },
    {
      label: t("wiki.items.stats.imbuementSlots"),
      value: item.imbuementSlots,
    },
    {
      label: t("wiki.items.stats.capacity"),
      value: item.containerCapacity,
    },
    { label: t("wiki.items.stats.charges"), value: item.charges },
    { label: t("wiki.items.stats.speed"), value: item.speed },
  ].filter((stat) => stat.value !== undefined);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="ui-panel-frame relative isolate flex max-h-full w-full max-w-3xl flex-col overflow-hidden p-4 shadow-2xl sm:p-7"
      >
        <div
          aria-hidden
          className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.04] mix-blend-soft-light"
        />
        <header className="flex shrink-0 items-start gap-3 sm:gap-4">
          <span className="flex size-20 shrink-0 items-center justify-center rounded-md border border-ui-gold/25 bg-black/35 shadow-inner sm:size-24">
            <SpriteIcon spriteId={item.spriteId} scale={2.5} />
          </span>
          <span className="min-w-0 flex-1 pt-1">
            <h3 className="font-display text-xl font-bold tracking-wide text-ui-text-bright capitalize sm:text-2xl">
              {item.name}
            </h3>
            <span className="mt-1 block text-[10px] tracking-[0.18em] text-ui-gold uppercase">
              {item.primaryType ?? t("wiki.items.categories.other")}
            </span>
            <span className="mt-3 block text-sm text-ui-muted">
              {t("wiki.items.weight", {
                weight: (item.weight / 100).toFixed(2),
              })}
            </span>
          </span>
          <CloseButton label={t("modal.close")} onClick={onClose} />
        </header>

        <div aria-hidden className="ui-divider my-4 shrink-0 sm:my-5" />

        <div className="ui-scrollbar min-h-0 overscroll-contain overflow-y-auto pr-1">
          {item.description && (
            <p className="text-sm leading-6 text-ui-text/85">
              {item.description}
            </p>
          )}

          {stats.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="ui-panel-inset rounded-sm border border-ui-stone-light/15 px-3 py-2"
                >
                  <dt className="text-[9px] tracking-widest text-ui-muted uppercase">
                    {stat.label}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ui-text-bright">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {item.requirements && (
            <section className="mt-5 rounded-sm border border-ui-gold/20 bg-black/25 p-3">
              <h4 className="text-[10px] tracking-widest text-ui-gold uppercase">
                {t("wiki.items.requirements")}
              </h4>
              <p className="mt-1 text-xs text-ui-text/80">
                {item.requirements.level !== undefined &&
                  t("wiki.items.requiredLevel", {
                    level: item.requirements.level,
                  })}
                {item.requirements.level !== undefined &&
                item.requirements.vocations?.length
                  ? " · "
                  : ""}
                {item.requirements.vocations?.join(", ")}
              </p>
            </section>
          )}

          <section className="mt-5 border-t border-ui-stone-light/15 pt-5">
            <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("wiki.items.droppedBy")}
            </h4>
            {sourcesPending && (
              <p className="py-6 text-center text-xs text-ui-muted">
                {t("wiki.items.sourcesLoading")}
              </p>
            )}
            {!sourcesPending && sources.length === 0 && (
              <p className="py-6 text-center text-xs text-ui-muted">
                {t("wiki.items.noSources")}
              </p>
            )}
            {!sourcesPending && sources.length > 0 && (
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {sources.map((source) => (
                  <li key={`${source.scope}-${source.raceId}`}>
                    <WikiItemSourceCard
                      source={source}
                      onSelect={onSelectSource}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
