"use client";

import type { AutoPotionSettings } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { PotionBarItem } from "../../lib/inventory/getPotionBarItems";
import { AutoPotionRuleRow } from "./AutoPotionRuleRow";

interface AutoPotionSettingsPanelProps {
  readonly settings: AutoPotionSettings;
  readonly potions: ReadonlyArray<PotionBarItem>;
  readonly onChange: (settings: AutoPotionSettings) => void;
}

export function AutoPotionSettingsPanel({
  settings,
  potions,
  onChange,
}: AutoPotionSettingsPanelProps) {
  const { t } = useAppTranslation();

  return (
    <section
      aria-labelledby="auto-potion-title"
      className="rounded-lg border border-ui-gold/20 bg-ui-panel-deep/65 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="auto-potion-title"
            className="font-display text-sm tracking-wider text-ui-text-bright uppercase"
          >
            {t("potions.autoPotion.title")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-ui-muted">
            {t("potions.autoPotion.description")}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-ui-stone-light/20 bg-black/20 px-3 py-2 text-sm font-semibold text-ui-text-bright">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!settings.health && !settings.mana}
            onChange={(event) =>
              onChange({ ...settings, enabled: event.currentTarget.checked })
            }
          />
          {t("potions.autoPotion.enabled")}
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <AutoPotionRuleRow
          resource="health"
          rule={settings.health}
          potions={potions}
          onChange={(health) =>
            onChange({
              ...settings,
              enabled: health || settings.mana ? settings.enabled : false,
              health,
            })
          }
        />
        <AutoPotionRuleRow
          resource="mana"
          rule={settings.mana}
          potions={potions}
          onChange={(mana) =>
            onChange({
              ...settings,
              enabled: settings.health || mana ? settings.enabled : false,
              mana,
            })
          }
        />
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-ui-muted">
          {t("potions.autoPotion.priority")}
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["health", "mana"] as const).map((priority) => (
            <label
              key={priority}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-ui-stone-light/15 px-3 py-2 text-sm text-ui-text hover:border-ui-gold/40"
            >
              <input
                type="radio"
                name="auto-potion-priority"
                value={priority}
                checked={settings.priority === priority}
                onChange={() => onChange({ ...settings, priority })}
              />
              {t(`potions.autoPotion.${priority}First`)}
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
