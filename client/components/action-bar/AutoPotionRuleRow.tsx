"use client";

import type { AutoPotionRule } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { PotionBarItem } from "../../lib/inventory/getPotionBarItems";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface AutoPotionRuleRowProps {
  readonly resource: "health" | "mana";
  readonly rule: AutoPotionRule | null;
  readonly potions: ReadonlyArray<PotionBarItem>;
  readonly onChange: (rule: AutoPotionRule | null) => void;
}

export function AutoPotionRuleRow({
  resource,
  rule,
  potions,
  onChange,
}: AutoPotionRuleRowProps) {
  const { t } = useAppTranslation();
  const eligiblePotions = potions.filter(({ item }) =>
    item.potionResources?.includes(resource),
  );
  const selectedPotion =
    eligiblePotions.find(({ item }) => item.typeId === rule?.itemTypeId)
      ?.item;
  const defaultPotion = selectedPotion ?? eligiblePotions[0]?.item;
  const displayedPotion = rule ? selectedPotion : defaultPotion;

  const enableRule = () => {
    if (!defaultPotion) return;
    onChange({
      itemTypeId: defaultPotion.typeId,
      thresholdPercent: 50,
    });
  };

  return (
    <fieldset className="rounded-lg border border-ui-stone-light/15 bg-black/20 p-3">
      <legend className="px-1 text-xs font-semibold tracking-wide text-ui-text-bright uppercase">
        {t(`potions.autoPotion.${resource}`)}
      </legend>

      <label className="mb-3 flex items-center gap-2 text-sm text-ui-text-bright">
        <input
          type="checkbox"
          checked={rule !== null}
          disabled={!rule && eligiblePotions.length === 0}
          onChange={(event) => {
            if (event.currentTarget.checked) {
              enableRule();
              return;
            }
            onChange(null);
          }}
        />
        {t("potions.autoPotion.useRule", {
          resource: t(`potions.autoPotion.${resource}`).toLowerCase(),
        })}
      </label>

      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3">
        <div className="flex size-12 items-center justify-center overflow-hidden rounded-md border border-ui-stone-light/20 bg-ui-panel-deep/70">
          {displayedPotion && (
            <SpriteIcon spriteId={displayedPotion.spriteId} />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-ui-muted">
            <span>{t("potions.autoPotion.potion")}</span>
            <span className="relative block">
              <select
                aria-label={t("potions.autoPotion.potionFor", {
                  resource: t(`potions.autoPotion.${resource}`),
                })}
                value={rule?.itemTypeId ?? defaultPotion?.typeId ?? ""}
                disabled={!rule}
                onChange={(event) => {
                  if (!rule) return;
                  onChange({
                    ...rule,
                    itemTypeId: Number(event.currentTarget.value),
                  });
                }}
                className="ui-dropdown h-10 w-full rounded-md border border-ui-stone-light/25 py-2 pr-10 pl-3 text-sm text-white outline-none hover:border-ui-gold/45 focus:border-ui-gold/60 focus:ring-2 focus:ring-ui-gold/15 disabled:opacity-45"
              >
                {rule && !selectedPotion && (
                  <option value={rule.itemTypeId}>
                    {t("potions.autoPotion.unavailablePotion", {
                      itemTypeId: rule.itemTypeId,
                    })}
                  </option>
                )}
                {eligiblePotions.map(({ item, count }) => (
                  <option key={item.typeId} value={item.typeId}>
                    {item.name} ({count})
                  </option>
                ))}
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ui-accent-light"
              >
                ▼
              </span>
            </span>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ui-muted">
            <span>{t("potions.autoPotion.below")}</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                value={rule?.thresholdPercent ?? 50}
                disabled={!rule}
                onChange={(event) => {
                  if (!rule) return;
                  const thresholdPercent = Math.min(
                    99,
                    Math.max(1, Number(event.currentTarget.value)),
                  );
                  onChange({ ...rule, thresholdPercent });
                }}
                className="h-10 min-w-0 flex-1 rounded-md border border-ui-stone-light/25 bg-ui-panel-deep px-3 text-sm tabular-nums text-white outline-none hover:border-ui-gold/45 focus:border-ui-gold/60 focus:ring-2 focus:ring-ui-gold/15 disabled:opacity-45"
              />
              <span className="font-semibold text-ui-text-bright">%</span>
            </span>
          </label>
        </div>
      </div>

      {eligiblePotions.length === 0 && (
        <p className="mt-2 text-xs text-ui-muted">
          {t("potions.autoPotion.noEligiblePotion", {
            resource: t(`potions.autoPotion.${resource}`).toLowerCase(),
          })}
        </p>
      )}
    </fieldset>
  );
}
