"use client";

import { useMemo } from "react";
import type { ImbuementOption } from "@tibia/protocol";
import { formatImbuementDuration } from "../../lib/imbuement/formatImbuementDuration";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ImbuementIcon } from "./ImbuementIcon";
import { ImbuementPanel } from "./ImbuementPanel";

interface ImbuementListPanelProps {
  options: ReadonlyArray<ImbuementOption>;
  tier: number;
  onSelectTier: (baseId: number) => void;
  selectedImbuementId: number | null;
  onSelectImbuement: (imbuementId: number) => void;
  durationSeconds: number;
}

/** Always-visible quality tabs and icon choices for an empty slot. */
export function ImbuementListPanel({
  options,
  tier,
  onSelectTier,
  selectedImbuementId,
  onSelectImbuement,
  durationSeconds,
}: ImbuementListPanelProps) {
  const { t } = useAppTranslation();
  const tiers = useMemo(() => {
    const byBaseId = new Map<
      number,
      { baseName: string; enabled: boolean; premium: boolean }
    >();

    for (const option of options) {
      const existing = byBaseId.get(option.baseId);
      byBaseId.set(option.baseId, {
        baseName: option.baseName,
        enabled:
          (existing?.enabled ?? false) ||
          option.blockedReason !== "wrong-category",
        premium: existing ? existing.premium && option.premium : option.premium,
      });
    }

    return [...byBaseId.entries()]
      .map(([baseId, entry]) => ({ baseId, ...entry }))
      .sort((left, right) => left.baseId - right.baseId);
  }, [options]);
  const visible = useMemo(
    () =>
      options.filter(
        (option) =>
          option.baseId === tier && option.blockedReason !== "wrong-category",
      ),
    [options, tier],
  );
  const selected =
    visible.find((option) => option.imbuementId === selectedImbuementId) ??
    null;

  return (
    <ImbuementPanel title={t("imbuement.imbueEmptySlot")}>
      <div className="flex flex-col gap-2 p-4">
        <div role="tablist" className="grid grid-cols-3 gap-2">
          {tiers.map((tierOption) => (
            <button
              key={tierOption.baseId}
              type="button"
              role="tab"
              aria-selected={tierOption.baseId === tier}
              disabled={!tierOption.enabled}
              onClick={() => onSelectTier(tierOption.baseId)}
              className={`flex h-10 min-w-0 items-center justify-center gap-2 border px-2 font-display text-sm font-bold tracking-wide transition-colors ${
                tierOption.baseId === tier
                  ? "border-ui-gold/65 bg-ui-gold/10 text-ui-text-bright"
                  : "border-ui-stone-light/20 bg-black/30 text-ui-muted hover:border-ui-stone-light/45"
              } disabled:cursor-not-allowed disabled:opacity-35`}
            >
              <span aria-hidden className="flex shrink-0 gap-0.5 text-xs text-ui-accent-light">
                {Array.from({ length: tierOption.baseId }, (_, gem) => (
                  <span key={`${tierOption.baseId}-${gem}`}>◆</span>
                ))}
              </span>
              <span className="truncate">{tierOption.baseName}</span>
              {tierOption.premium && (
                <span aria-hidden className="text-ui-gold">
                  ♛
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="ui-scrollbar overflow-x-auto pb-1">
          {visible.length === 0 ? (
            <p className="py-4 text-center text-sm text-ui-muted">
              {t("imbuement.noOptions")}
            </p>
          ) : (
            <ul className="flex min-w-full w-max justify-center gap-2">
              {visible.map((option) => {
                const label = option.name.startsWith(option.baseName)
                  ? option.name
                  : `${option.baseName} ${option.name}`;
                return (
                  <li key={option.imbuementId}>
                    <button
                      type="button"
                      aria-label={label}
                      aria-pressed={option.imbuementId === selectedImbuementId}
                      title={label}
                      onClick={() => onSelectImbuement(option.imbuementId)}
                      className={`relative flex size-20 items-center justify-center border bg-black/40 transition-colors ${
                        option.imbuementId === selectedImbuementId
                          ? "border-ui-text-bright bg-ui-gold/10"
                          : "border-ui-stone-light/20 hover:border-ui-gold/55"
                      } ${option.canApply ? "" : "opacity-55"}`}
                    >
                      <ImbuementIcon iconId={option.iconId} size={68} />
                      {option.premium && (
                        <span
                          aria-hidden
                          className="absolute top-0 right-0 text-xs text-ui-gold"
                        >
                          ♛
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selected?.canApply && (
          <div className="flex min-h-12 items-center gap-3 bg-black/20 px-3 py-1.5 text-ui-gold">
            <span className="flex size-9 shrink-0 items-center justify-center">
              <ImbuementIcon iconId={selected.iconId} size={32} />
            </span>
            <p className="text-sm">
              {t("imbuement.effectAndDuration", {
                description: selected.description,
                duration: formatImbuementDuration(durationSeconds),
              })}
            </p>
          </div>
        )}
      </div>
    </ImbuementPanel>
  );
}
