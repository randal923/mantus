import { z } from "zod";

export const TURN_MODIFIERS = ["Alt", "Control", "Meta", "Shift"] as const;

export const turnModifierSchema = z.enum(TURN_MODIFIERS);

/** Screen placement and size (CSS px) of the minimap panel's canvas. */
export const minimapLayoutSchema = z
  .object({
    x: z.number().int().min(0).max(20_000),
    y: z.number().int().min(0).max(20_000),
    width: z.number().int().min(220).max(720),
    height: z.number().int().min(180).max(560),
  })
  .strict();

/** Screen placement and size (CSS px) of a movable HUD panel. */
export const panelLayoutSchema = z
  .object({
    x: z.number().int().min(0).max(20_000),
    y: z.number().int().min(0).max(20_000),
    width: z.number().int().min(160).max(1_200),
    height: z.number().int().min(120).max(1_200),
  })
  .strict();

/**
 * Account-wide client UI preferences. Strict and bounded on purpose: the
 * server persists only known keys with validated ranges, never a free-form
 * blob. Absent keys mean "use the client default", which is also what
 * "reset layout" sends: an object with the layout keys omitted.
 */
export const uiSettingsSchema = z
  .object({
    minimap: minimapLayoutSchema.optional(),
    chat: panelLayoutSchema.optional(),
    battleList: panelLayoutSchema.optional(),
    spellBar: panelLayoutSchema.optional(),
    chatPinnedOpen: z.boolean().optional(),
    turnModifier: turnModifierSchema.optional(),
  })
  .strict();

export type MinimapLayout = z.infer<typeof minimapLayoutSchema>;
export type PanelLayout = z.infer<typeof panelLayoutSchema>;
export type TurnModifier = z.infer<typeof turnModifierSchema>;
export type UiSettings = z.infer<typeof uiSettingsSchema>;

export const DEFAULT_TURN_MODIFIER: TurnModifier = "Shift";
