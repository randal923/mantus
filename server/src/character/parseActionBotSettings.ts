import {
  ACTION_BOT_RULE_COUNT,
  actionBotAutoHasteSchema,
  actionBotSettingsSchema,
  actionBotTriggerSchema,
  DEFAULT_ACTION_BOT_SETTINGS,
  type ActionBar,
  type ActionBotRule,
  type ActionBotSettings,
} from "@tibia/protocol";
import { z } from "zod";

/**
 * The shape stored while bot rules pointed at an action bar slot. Rules own
 * their action now, so persisted slot indices are resolved against the bar
 * once, at load, and never again.
 */
const slottedSettingsSchema = z
  .object({
    enabled: z.boolean(),
    autoHaste: actionBotAutoHasteSchema.default({
      enabled: false,
      spellId: "utani-hur",
    }),
    autoUtamoVita: z.boolean().default(false),
    rules: z
      .array(
        z
          .object({
            id: z
              .string()
              .min(1)
              .max(64)
              .regex(/^[A-Za-z0-9_-]+$/),
            enabled: z.boolean(),
            slotIndex: z.number().int().min(0),
            trigger: actionBotTriggerSchema,
            unequipWhenInactive: z.boolean(),
          })
          .strict(),
      )
      .max(ACTION_BOT_RULE_COUNT),
  })
  .strict();

const legacySettingsSchema = z
  .object({
    enabled: z.boolean(),
    health: z
      .object({
        itemTypeId: z.number().int().positive().max(65_535),
        thresholdPercent: z.number().int().min(1).max(99),
      })
      .strict()
      .nullable(),
    mana: z
      .object({
        itemTypeId: z.number().int().positive().max(65_535),
        thresholdPercent: z.number().int().min(1).max(99),
      })
      .strict()
      .nullable(),
    priority: z.enum(["health", "mana"]),
  })
  .strict();

/** Folds the support rules players used to write by hand into the toggles. */
function liftSupportRules(settings: ActionBotSettings): ActionBotSettings {
  let autoHaste = settings.autoHaste;
  let autoUtamoVita = settings.autoUtamoVita;
  const rules = settings.rules.filter((rule) => {
    if (rule.trigger.kind !== "condition-missing") return true;
    const action = rule.action;
    if (
      rule.trigger.condition === "haste" &&
      action.kind === "spell" &&
      (action.spellId === "utani-hur" || action.spellId === "utani-gran-hur")
    ) {
      if (!autoHaste.enabled) {
        autoHaste = { enabled: rule.enabled, spellId: action.spellId };
      }
      return false;
    }
    if (
      rule.trigger.condition === "magic-shield" &&
      action.kind === "spell" &&
      action.spellId === "utamo-vita"
    ) {
      if (!autoUtamoVita) autoUtamoVita = rule.enabled;
      return false;
    }
    return true;
  });
  return { ...settings, autoHaste, autoUtamoVita, rules };
}

export function parseActionBotSettings(
  raw: unknown,
  actionBar: ActionBar,
): ActionBotSettings {
  const object =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as {
          botSettings?: unknown;
          autoPotionSettings?: unknown;
        })
      : null;
  const parsed = actionBotSettingsSchema.safeParse(object?.botSettings);
  if (parsed.success) return liftSupportRules(parsed.data);

  const slotted = slottedSettingsSchema.safeParse(object?.botSettings);
  if (slotted.success) {
    const rules = slotted.data.rules.flatMap<ActionBotRule>((rule) => {
      const action = actionBar[rule.slotIndex]?.action;
      if (!action || action.kind === "text") return [];
      return [
        {
          id: rule.id,
          enabled: rule.enabled,
          action,
          trigger: rule.trigger,
          unequipWhenInactive: rule.unequipWhenInactive,
        },
      ];
    });
    return liftSupportRules({ ...slotted.data, rules });
  }

  const legacy = legacySettingsSchema.safeParse(object?.autoPotionSettings);
  if (!legacy.success) return { ...DEFAULT_ACTION_BOT_SETTINGS, rules: [] };
  const resources =
    legacy.data.priority === "health"
      ? (["health", "mana"] as const)
      : (["mana", "health"] as const);
  const rules: ActionBotRule[] = [];
  for (const resource of resources) {
    const setting = legacy.data[resource];
    if (!setting) continue;
    const action = actionBar.find(
      (slot) =>
        slot.action?.kind === "item" &&
        slot.action.itemTypeId === setting.itemTypeId,
    )?.action;
    if (!action || action.kind !== "item") continue;
    rules.push({
      id: `legacy-${resource}`,
      enabled: true,
      action,
      trigger: {
        kind: "resource-below",
        resource,
        percent: setting.thresholdPercent,
      },
      unequipWhenInactive: false,
    });
  }
  return {
    enabled: legacy.data.enabled,
    autoHaste: { ...DEFAULT_ACTION_BOT_SETTINGS.autoHaste },
    autoUtamoVita: false,
    rules,
  };
}
