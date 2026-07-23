import { z } from "zod";

export const ACTION_BAR_ROW_SLOT_COUNT = 9;
export const ACTION_BAR_SLOT_COUNT = ACTION_BAR_ROW_SLOT_COUNT * 2;
export const ACTION_BOT_RULE_COUNT = 12;
export const ACTION_BOT_HASTE_SPELL_IDS = [
  "utani-hur",
  "utani-gran-hur",
] as const;

export const actionBarHotkeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^(?:(?:Alt|Control|Meta|Shift)\+){0,4}[A-Za-z0-9]+$/);

export const actionBarTargetModeSchema = z.enum([
  "self",
  "attack-target",
  "direction",
  "cursor",
  "crosshair",
]);

export const actionBarItemModeSchema = z.enum([
  "use-on-self",
  "use-on-target",
  "use-at-cursor",
  "use-with-crosshair",
  "equip",
  "use",
]);

export const actionBarActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("spell"),
      spellId: z.string().min(1).max(96),
      targetMode: actionBarTargetModeSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("item"),
      itemTypeId: z.number().int().positive().max(65_535),
      mode: actionBarItemModeSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("text"),
      text: z.string().min(1).max(96),
      sendAutomatically: z.boolean(),
    })
    .strict(),
]);

export const actionBarSlotSchema = z
  .object({
    action: actionBarActionSchema.nullable(),
    hotkey: actionBarHotkeySchema.nullable(),
  })
  .strict();

/**
 * One per-character Tibia-style action bar. A slot owns both its action and
 * hotkey so empty buttons can retain custom key assignments.
 */
export const actionBarSchema = z
  .array(actionBarSlotSchema)
  .max(ACTION_BAR_SLOT_COUNT);

export const actionBotTriggerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("resource-below"),
      resource: z.enum(["health", "mana"]),
      percent: z.number().int().min(1).max(99),
    })
    .strict(),
  z
    .object({
      kind: z.literal("resource-above"),
      resource: z.enum(["health", "mana"]),
      percent: z.number().int().min(1).max(99),
    })
    .strict(),
  z.object({ kind: z.literal("target-present") }).strict(),
  z
    .object({
      kind: z.literal("condition-missing"),
      condition: z.enum(["haste", "magic-shield"]),
    })
    .strict(),
]);

export const actionBotRuleSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    enabled: z.boolean(),
    slotIndex: z.number().int().min(0).max(ACTION_BAR_SLOT_COUNT - 1),
    trigger: actionBotTriggerSchema,
    unequipWhenInactive: z.boolean(),
  })
  .strict();

export const actionBotAutoHasteSchema = z
  .object({
    enabled: z.boolean(),
    spellId: z.enum(ACTION_BOT_HASTE_SPELL_IDS),
  })
  .strict();

export const actionBotSettingsSchema = z
  .object({
    enabled: z.boolean(),
    autoHaste: actionBotAutoHasteSchema.default({
      enabled: false,
      spellId: "utani-hur",
    }),
    autoUtamoVita: z.boolean().default(false),
    rules: z.array(actionBotRuleSchema).max(ACTION_BOT_RULE_COUNT),
  })
  .strict();

export const DEFAULT_ACTION_BOT_SETTINGS = {
  enabled: false,
  autoHaste: {
    enabled: false,
    spellId: "utani-hur",
  },
  autoUtamoVita: false,
  rules: [],
} as const satisfies z.infer<typeof actionBotSettingsSchema>;

export function createDefaultActionBar(): ActionBar {
  return Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, index) => ({
    action: null,
    hotkey:
      index < ACTION_BAR_ROW_SLOT_COUNT
        ? `Digit${index + 1}`
        : `Shift+Digit${index - ACTION_BAR_ROW_SLOT_COUNT + 1}`,
  }));
}

export type ActionBarHotkey = z.infer<typeof actionBarHotkeySchema>;
export type ActionBarTargetMode = z.infer<typeof actionBarTargetModeSchema>;
export type ActionBarItemMode = z.infer<typeof actionBarItemModeSchema>;
export type ActionBarAction = z.infer<typeof actionBarActionSchema>;
export type ActionBarSlot = z.infer<typeof actionBarSlotSchema>;
export type ActionBar = z.infer<typeof actionBarSchema>;
export type ActionBotTrigger = z.infer<typeof actionBotTriggerSchema>;
export type ActionBotRule = z.infer<typeof actionBotRuleSchema>;
export type ActionBotAutoHaste = z.infer<typeof actionBotAutoHasteSchema>;
export type ActionBotSettings = z.infer<typeof actionBotSettingsSchema>;
