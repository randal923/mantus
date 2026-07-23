import type {
  ActionBar,
  ActionBotRule,
  ActionBotTrigger,
  InventoryItem,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getActionBarActionName } from "../../lib/action-bar/getActionBarActionName";
import { Checkbox } from "../ui/Checkbox";
import { Dropdown } from "../ui/Dropdown";
import { ActionBarActionIcon } from "./ActionBarActionIcon";

interface ActionBotRuleRowProps {
  readonly rule: ActionBotRule;
  readonly ruleNumber: number;
  readonly actionBar: ActionBar;
  readonly spells: ReadonlyArray<SpellCatalogEntry>;
  readonly items: ReadonlyArray<InventoryItem>;
  readonly onChange: (rule: ActionBotRule) => void;
  readonly onRemove: () => void;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
}

const TRIGGER_KINDS: ReadonlyArray<ActionBotTrigger["kind"]> = [
  "resource-below",
  "resource-above",
  "target-present",
  "condition-missing",
];

const RESOURCES = ["health", "mana"] as const;

const CONDITIONS = [
  "haste",
  "magic-shield",
] as const;

function triggerForKind(
  kind: ActionBotTrigger["kind"],
): ActionBotTrigger {
  if (kind === "target-present") return { kind };
  if (kind === "condition-missing") {
    return { kind, condition: "haste" };
  }
  return { kind, resource: "health", percent: 50 };
}

function withTriggerResource(
  trigger: ActionBotTrigger,
  resource: "health" | "mana",
): ActionBotTrigger {
  if (
    trigger.kind !== "resource-below" &&
    trigger.kind !== "resource-above"
  ) {
    return trigger;
  }
  return { ...trigger, resource };
}

function withTriggerPercent(
  trigger: ActionBotTrigger,
  percent: number,
): ActionBotTrigger {
  if (
    trigger.kind !== "resource-below" &&
    trigger.kind !== "resource-above"
  ) {
    return trigger;
  }
  return { ...trigger, percent };
}

export function ActionBotRuleRow({
  rule,
  ruleNumber,
  actionBar,
  spells,
  items,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ActionBotRuleRowProps) {
  const { t } = useAppTranslation();
  const action = actionBar[rule.slotIndex]?.action ?? null;
  const isEquip = action?.kind === "item" && action.mode === "equip";
  const resourceTrigger =
    rule.trigger.kind === "resource-below" ||
    rule.trigger.kind === "resource-above"
      ? rule.trigger
      : null;
  const actionOptions = actionBar.flatMap((slot, index) =>
    slot.action && slot.action.kind !== "text"
      ? [
          {
            value: String(index),
            label: `${index + 1}. ${getActionBarActionName(
              slot.action,
              spells,
              items,
            )}`,
          },
        ]
      : [],
  );
  const triggerOptions = TRIGGER_KINDS.map((kind) => ({
    value: kind,
    label: t(`actionBot.triggers.${kind}`),
  }));
  const resourceOptions = RESOURCES.map((resource) => ({
    value: resource,
    label: t(`actionBot.resources.${resource}`),
  }));
  const conditionOptions = CONDITIONS.map((condition) => ({
    value: condition,
    label: t(`actionBot.conditions.${condition}`),
  }));
  const triggerDescription =
    rule.trigger.kind === "target-present"
      ? t("actionBot.triggerDescriptions.target")
      : rule.trigger.kind === "condition-missing"
        ? t("actionBot.triggerDescriptions.condition", {
            condition: t(
              `actionBot.conditions.${rule.trigger.condition}`,
            ).toLocaleLowerCase(),
          })
        : t("actionBot.triggerDescriptions.resource", {
            resource: t(
              `actionBot.resources.${rule.trigger.resource}`,
            ).toLocaleLowerCase(),
            direction: t(
              rule.trigger.kind === "resource-below"
                ? "actionBot.directions.below"
                : "actionBot.directions.above",
            ),
            percent: rule.trigger.percent,
          });
  return (
    <article className="overflow-hidden rounded-lg border border-ui-stone-light/20 bg-ui-panel-deep/75 shadow-inner shadow-black/30">
      <div className="grid items-center gap-3 p-3 lg:grid-cols-12">
        <div className="flex items-center justify-between lg:col-span-1 lg:justify-center">
          <span className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase lg:hidden">
            {t("actionBot.enabled")}
          </span>
          <Checkbox
            checked={rule.enabled}
            aria-label={t("actionBot.enableRule", {
              number: ruleNumber,
            })}
            onChange={(event) =>
              onChange({ ...rule, enabled: event.currentTarget.checked })
            }
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2 lg:col-span-3">
          <span className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase lg:hidden">
            {t("actionBot.columns.action")}
          </span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-md border border-ui-stone-light/20 bg-black/35">
              <ActionBarActionIcon action={action} items={items} />
            </span>
            <Dropdown
              ariaLabel={t("actionBot.actionForRule", {
                number: ruleNumber,
              })}
              value={String(rule.slotIndex)}
              options={actionOptions}
              onChange={(slotIndex) =>
                onChange({
                  ...rule,
                  slotIndex: Number(slotIndex),
                })
              }
              className="flex-1"
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 lg:col-span-3">
          <span className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase lg:hidden">
            {t("actionBot.columns.activateWhen")}
          </span>
          <Dropdown
            ariaLabel={t("actionBot.activationForRule", {
              number: ruleNumber,
            })}
            value={rule.trigger.kind}
            options={triggerOptions}
            onChange={(kind) =>
              onChange({
                ...rule,
                trigger: triggerForKind(kind),
              })
            }
          />
        </div>
        {resourceTrigger && (
          <div className="flex min-w-0 flex-col gap-2 lg:col-span-3">
            <span className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase lg:hidden">
              {t("actionBot.columns.setting")}
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <Dropdown
                ariaLabel={t("actionBot.resourceForRule", {
                  number: ruleNumber,
                })}
                value={resourceTrigger.resource}
                options={resourceOptions}
                onChange={(resource) =>
                  onChange({
                    ...rule,
                    trigger: withTriggerResource(
                      resourceTrigger,
                      resource,
                    ),
                  })
                }
                className="flex-1"
              />
              <div className="flex h-10 w-28 shrink-0 overflow-hidden rounded-md border border-ui-stone-light/25 bg-black/35">
                <button
                  type="button"
                  aria-label={t("actionBot.decreaseThreshold", {
                    number: ruleNumber,
                  })}
                  onClick={() =>
                    onChange({
                      ...rule,
                      trigger: withTriggerPercent(
                        resourceTrigger,
                        Math.max(1, resourceTrigger.percent - 5),
                      ),
                    })
                  }
                  className="w-8 border-r border-ui-stone-light/20 text-lg text-ui-muted hover:bg-white/5 hover:text-ui-text-bright"
                >
                  −
                </button>
                <output className="flex min-w-12 items-center justify-center px-1 text-sm font-bold tabular-nums text-ui-text-bright">
                  {resourceTrigger.percent}%
                </output>
                <button
                  type="button"
                  aria-label={t("actionBot.increaseThreshold", {
                    number: ruleNumber,
                  })}
                  onClick={() =>
                    onChange({
                      ...rule,
                      trigger: withTriggerPercent(
                        resourceTrigger,
                        Math.min(99, resourceTrigger.percent + 5),
                      ),
                    })
                  }
                  className="w-8 border-l border-ui-stone-light/20 text-lg text-ui-muted hover:bg-white/5 hover:text-ui-text-bright"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}
        {rule.trigger.kind === "target-present" && (
          <div className="flex min-w-0 flex-col gap-2 lg:col-span-3">
            <span className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase lg:hidden">
              {t("actionBot.columns.setting")}
            </span>
            <div
              title={t("actionBot.currentTarget")}
              className="flex h-10 min-w-0 items-center truncate rounded-md border border-ui-stone-light/20 bg-black/30 px-3 text-sm text-ui-text-bright"
            >
              {t("actionBot.currentTarget")}
            </div>
          </div>
        )}
        {rule.trigger.kind === "condition-missing" && (
          <div className="flex min-w-0 flex-col gap-2 lg:col-span-3">
            <span className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase lg:hidden">
              {t("actionBot.columns.setting")}
            </span>
            <Dropdown
              ariaLabel={t("actionBot.missingEffectForRule", {
                number: ruleNumber,
              })}
              value={rule.trigger.condition}
              options={conditionOptions}
              onChange={(condition) =>
                onChange({
                  ...rule,
                  trigger: {
                    kind: "condition-missing",
                    condition,
                  },
                })
              }
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-1 lg:col-span-2">
          <button
            type="button"
            aria-label={t("actionBot.explainRule", {
              number: ruleNumber,
            })}
            title={triggerDescription}
            className="ui-button ui-button-secondary size-8 text-ui-gold"
          >
            ⓘ
          </button>
          <button
            type="button"
            disabled={!onMoveUp}
            aria-label={t("actionBot.moveRuleUp")}
            onClick={onMoveUp}
            className="ui-button ui-button-secondary size-8 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={!onMoveDown}
            aria-label={t("actionBot.moveRuleDown")}
            onClick={onMoveDown}
            className="ui-button ui-button-secondary size-8 disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={t("actionBot.removeRule")}
            onClick={onRemove}
            className="ui-button ui-button-secondary size-8 text-red-300"
          >
            ×
          </button>
        </div>
      </div>
      {isEquip && (
        <div className="border-t border-ui-stone-light/15 bg-black/20 px-3 py-2">
          <Checkbox
            checked={rule.unequipWhenInactive}
            onChange={(event) =>
              onChange({
                ...rule,
                unequipWhenInactive: event.currentTarget.checked,
              })
            }
            label={t("actionBot.unequipInactive")}
            className="text-sm text-ui-text"
          />
        </div>
      )}
    </article>
  );
}
