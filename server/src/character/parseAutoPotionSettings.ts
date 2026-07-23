import {
  autoPotionSettingsSchema,
  DEFAULT_AUTO_POTION_SETTINGS,
  type AutoPotionSettings,
} from "@tibia/protocol";

export function parseAutoPotionSettings(raw: unknown): AutoPotionSettings {
  const candidate =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { autoPotionSettings?: unknown }).autoPotionSettings
      : undefined;
  const parsed = autoPotionSettingsSchema.safeParse(candidate);
  return parsed.success
    ? parsed.data
    : { ...DEFAULT_AUTO_POTION_SETTINGS };
}
