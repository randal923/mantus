import type {
  ActionBar,
  ActionBotSettings,
} from "@tibia/protocol";

export function removeInvalidActionBotRules(
  settings: ActionBotSettings,
  actionBar: ActionBar,
): ActionBotSettings {
  const rules = settings.rules.filter((rule) => {
    const action = actionBar[rule.slotIndex]?.action;
    return Boolean(action && action.kind !== "text");
  });
  return rules.length === settings.rules.length
    ? settings
    : { ...settings, rules };
}
