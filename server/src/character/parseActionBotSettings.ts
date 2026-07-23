import {
  actionBotSettingsSchema,
  DEFAULT_ACTION_BOT_SETTINGS,
  type ActionBar,
  type ActionBotRule,
  type ActionBotSettings,
} from "@tibia/protocol";
import { z } from "zod";

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
  if (parsed.success) {
    let autoHaste = parsed.data.autoHaste;
    let autoUtamoVita = parsed.data.autoUtamoVita;
    const rules = parsed.data.rules.filter((rule) => {
      if (rule.trigger.kind !== "condition-missing") return true;
      const action = actionBar[rule.slotIndex]?.action;
      if (
        rule.trigger.condition === "haste" &&
        action?.kind === "spell" &&
        (action.spellId === "utani-hur" ||
          action.spellId === "utani-gran-hur")
      ) {
        if (!autoHaste.enabled) {
          autoHaste = {
            enabled: rule.enabled,
            spellId: action.spellId,
          };
        }
        return false;
      }
      if (
        rule.trigger.condition === "magic-shield" &&
        action?.kind === "spell" &&
        action.spellId === "utamo-vita"
      ) {
        if (!autoUtamoVita) autoUtamoVita = rule.enabled;
        return false;
      }
      return true;
    });
    return {
      ...parsed.data,
      autoHaste,
      autoUtamoVita,
      rules,
    };
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
    const slotIndex = actionBar.findIndex(
      (slot) =>
        slot.action?.kind === "item" &&
        slot.action.itemTypeId === setting.itemTypeId,
    );
    if (slotIndex < 0) continue;
    rules.push({
      id: `legacy-${resource}`,
      enabled: true,
      slotIndex,
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
