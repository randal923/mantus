"use client";

import {
  ACTION_BOT_RULE_COUNT,
  type ActionBar,
  type ActionBotRule,
  type ActionBotSettings,
  type ActionBotTrigger,
  type InventoryItem,
  type SpellCatalogEntry,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ActionBotRuleRow } from "./ActionBotRuleRow";
import { ActionBarActionIcon } from "./ActionBarActionIcon";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Dropdown } from "../ui/Dropdown";

interface ActionBotSettingsPanelProps {
  readonly settings: ActionBotSettings;
  readonly actionBar: ActionBar;
  readonly initialSlot: number;
  readonly spells: ReadonlyArray<SpellCatalogEntry>;
  readonly items: ReadonlyArray<InventoryItem>;
  readonly onChange: (settings: ActionBotSettings) => void;
}

function defaultTrigger(
  slotIndex: number,
  actionBar: ActionBar,
  spells: ReadonlyArray<SpellCatalogEntry>,
  items: ReadonlyArray<InventoryItem>,
): ActionBotTrigger {
  const action = actionBar[slotIndex]?.action;
  if (action?.kind === "spell") {
    if (action.spellId.startsWith("utani-")) {
      return { kind: "condition-missing", condition: "haste" };
    }
    if (action.spellId === "utamo-vita") {
      return { kind: "condition-missing", condition: "magic-shield" };
    }
    const spell = spells.find((entry) => entry.id === action.spellId);
    return spell?.damageType === "healing"
      ? { kind: "resource-below", resource: "health", percent: 70 }
      : { kind: "target-present" };
  }
  if (action?.kind === "item") {
    const item = items.find((entry) => entry.typeId === action.itemTypeId);
    if (item?.useKind === "potion") {
      return {
        kind: "resource-below",
        resource:
          item.potionResources?.includes("health") === false
            ? "mana"
            : "health",
        percent: 70,
      };
    }
    if (item?.useKind === "rune") return { kind: "target-present" };
  }
  return { kind: "resource-below", resource: "health", percent: 50 };
}

export function ActionBotSettingsPanel({
  settings,
  actionBar,
  initialSlot,
  spells,
  items,
  onChange,
}: ActionBotSettingsPanelProps) {
  const { t } = useAppTranslation();
  const hasteSpells = spells.filter(
    (spell) =>
      spell.origin === "spell" &&
      (spell.id === "utani-hur" || spell.id === "utani-gran-hur"),
  );
  const selectedHaste =
    hasteSpells.find(
      (spell) => spell.id === settings.autoHaste.spellId,
    ) ??
    hasteSpells[0];
  const utamoVita = spells.find(
    (spell) => spell.origin === "spell" && spell.id === "utamo-vita",
  );
  const configuredSlots = actionBar.flatMap((slot, index) =>
    slot.action && slot.action.kind !== "text" ? [index] : [],
  );
  const addRule = () => {
    const slotIndex = configuredSlots.includes(initialSlot)
      ? initialSlot
      : configuredSlots[0];
    if (
      slotIndex === undefined ||
      settings.rules.length >= ACTION_BOT_RULE_COUNT
    ) {
      return;
    }
    const rule: ActionBotRule = {
      id: crypto.randomUUID(),
      enabled: true,
      slotIndex,
      trigger: defaultTrigger(slotIndex, actionBar, spells, items),
      unequipWhenInactive: false,
    };
    onChange({ ...settings, rules: [...settings.rules, rule] });
  };
  const replaceRule = (index: number, rule: ActionBotRule) => {
    const rules = [...settings.rules];
    rules[index] = rule;
    onChange({ ...settings, rules });
  };
  const moveRule = (from: number, to: number) => {
    const rules = [...settings.rules];
    const [rule] = rules.splice(from, 1);
    if (!rule) return;
    rules.splice(to, 0, rule);
    onChange({ ...settings, rules });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-lg border border-ui-gold/25 bg-gradient-to-r from-ui-gold/10 to-transparent p-3">
        <div className="flex size-9 items-center justify-center rounded-full border border-ui-gold/35 bg-black/30 text-lg text-ui-gold">
          ⚙
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base tracking-wide text-ui-text-bright">
            {t("actionBot.title")}
          </h3>
          <p className="text-sm text-ui-muted">
            {t("actionBot.description")}
          </p>
        </div>
        <Checkbox
          checked={settings.enabled}
          onChange={(event) =>
            onChange({ ...settings, enabled: event.currentTarget.checked })
          }
          label={t("actionBot.enabled")}
          className="shrink-0 text-sm font-medium text-ui-text"
        />
      </div>
      <div className="rounded-lg border border-ui-stone-light/15 bg-black/20 p-3">
        <div className="mb-3">
          <h4 className="font-display text-sm font-semibold tracking-wide text-ui-text-bright uppercase">
            {t("actionBot.quickHelpers")}
          </h4>
          <p className="mt-1 text-xs text-ui-muted">
            {t("actionBot.quickHelpersDescription")}
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex h-full flex-col rounded-lg border border-ui-stone-light/20 bg-ui-panel-deep/70 p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-ui-stone-light/20 bg-black/35">
                <ActionBarActionIcon
                  action={
                    selectedHaste
                      ? {
                          kind: "spell",
                          spellId: selectedHaste.id,
                          targetMode: "self",
                        }
                      : null
                  }
                  items={items}
                />
              </span>
              <div className="min-w-0 flex-1">
                <h5 className="font-display text-sm font-semibold text-ui-text-bright">
                  {t("actionBot.autoHaste")}
                </h5>
                <p className="text-xs text-ui-muted">
                  {t("actionBot.autoHasteDescription")}
                </p>
              </div>
            </div>
            <div className="mt-auto flex min-h-20 items-end gap-3 pt-3">
              <Dropdown
                label={t("actionBot.hasteSpell")}
                ariaLabel={t("actionBot.hasteSpell")}
                value={selectedHaste?.id ?? ""}
                options={hasteSpells.map((spell) => ({
                  value: spell.id,
                  label:
                    spell.id === "utani-gran-hur"
                      ? t("actionBot.strongHaste")
                      : t("actionBot.haste"),
                }))}
                disabled={hasteSpells.length === 0}
                onChange={(spellId) => {
                  if (
                    spellId !== "utani-hur" &&
                    spellId !== "utani-gran-hur"
                  ) {
                    return;
                  }
                  onChange({
                    ...settings,
                    autoHaste: {
                      ...settings.autoHaste,
                      spellId,
                    },
                  });
                }}
                className="flex-1"
              />
              <Checkbox
                checked={settings.autoHaste.enabled}
                disabled={!selectedHaste}
                aria-label={t("actionBot.enableAutoHaste")}
                title={t("actionBot.enableAutoHaste")}
                onChange={(event) => {
                  if (!selectedHaste) return;
                  const enabled = event.currentTarget.checked;
                  onChange({
                    ...settings,
                    enabled: enabled ? true : settings.enabled,
                    autoHaste: {
                      enabled,
                      spellId:
                        selectedHaste.id === "utani-gran-hur"
                          ? "utani-gran-hur"
                          : "utani-hur",
                    },
                  });
                }}
                className="h-10 shrink-0"
              />
            </div>
          </div>
          <div className="flex h-full flex-col rounded-lg border border-ui-stone-light/20 bg-ui-panel-deep/70 p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-ui-stone-light/20 bg-black/35">
                <ActionBarActionIcon
                  action={
                    utamoVita
                      ? {
                          kind: "spell",
                          spellId: utamoVita.id,
                          targetMode: "self",
                        }
                      : null
                  }
                  items={items}
                />
              </span>
              <div className="min-w-0 flex-1">
                <h5 className="font-display text-sm font-semibold text-ui-text-bright">
                  {t("actionBot.autoUtamoVita")}
                </h5>
                <p className="text-xs text-ui-muted">
                  {t("actionBot.autoUtamoVitaDescription")}
                </p>
              </div>
            </div>
            <div className="mt-auto flex min-h-20 items-end justify-end pt-3">
              <Checkbox
                checked={settings.autoUtamoVita}
                disabled={!utamoVita}
                aria-label={t("actionBot.enableAutoUtamoVita")}
                title={t("actionBot.enableAutoUtamoVita")}
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  onChange({
                    ...settings,
                    enabled: enabled ? true : settings.enabled,
                    autoUtamoVita: enabled,
                  });
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-stone-light/15 bg-black/20 p-3">
        <div>
          <h4 className="font-display text-sm font-semibold tracking-wide text-ui-text-bright uppercase">
            {t("actionBot.rulesTitle")}
          </h4>
          <p className="mt-1 text-xs text-ui-muted">
            {t("actionBot.rulesDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm tabular-nums text-ui-muted">
            {t("actionBot.ruleCount", {
              count: settings.rules.length,
              max: ACTION_BOT_RULE_COUNT,
            })}
          </span>
          <Button
            size="sm"
            disabled={
              configuredSlots.length === 0 ||
              settings.rules.length >= ACTION_BOT_RULE_COUNT
            }
            onClick={addRule}
          >
            {t("actionBot.addSelectedAction")}
          </Button>
        </div>
      </div>
      {settings.rules.length > 0 && (
        <div className="hidden grid-cols-12 gap-3 px-3 font-display text-xs font-bold tracking-widest text-ui-gold uppercase lg:grid">
          <span className="col-span-1 text-center">
            {t("actionBot.columns.on")}
          </span>
          <span className="col-span-3">
            {t("actionBot.columns.action")}
          </span>
          <span className="col-span-3">
            {t("actionBot.columns.activateWhen")}
          </span>
          <span className="col-span-3">
            {t("actionBot.columns.setting")}
          </span>
          <span className="col-span-2 text-right">
            {t("actionBot.columns.options")}
          </span>
        </div>
      )}
      <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1">
        {settings.rules.map((rule, index) => (
          <ActionBotRuleRow
            key={rule.id}
            rule={rule}
            ruleNumber={index + 1}
            actionBar={actionBar}
            spells={spells}
            items={items}
            onChange={(next) => replaceRule(index, next)}
            onRemove={() =>
              onChange({
                ...settings,
                rules: settings.rules.filter(
                  (candidate) => candidate.id !== rule.id,
                ),
              })
            }
            {...(index > 0
              ? { onMoveUp: () => moveRule(index, index - 1) }
              : {})}
            {...(index < settings.rules.length - 1
              ? { onMoveDown: () => moveRule(index, index + 1) }
              : {})}
          />
        ))}
      </div>
      {settings.rules.length === 0 && (
        <div className="rounded-xl border border-dashed border-ui-stone-light/20 bg-black/20 px-6 py-10 text-center">
          <p className="font-medium text-ui-text-bright">
            {t("actionBot.noRules")}
          </p>
          <p className="mt-1 text-sm text-ui-muted">
            {t("actionBot.noRulesDescription")}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg border border-ui-stone-light/15 bg-black/25 px-3 py-2 text-sm">
        <span className="font-display font-semibold tracking-wide text-ui-text-bright">
          {t("actionBot.status")}
        </span>
        <span
          className={
            settings.enabled ? "text-emerald-400" : "text-ui-muted"
          }
        >
          {settings.enabled
            ? t("actionBot.statusEnabled")
            : t("actionBot.statusDisabled")}
        </span>
      </div>
    </section>
  );
}
