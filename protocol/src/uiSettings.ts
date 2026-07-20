import { z } from "zod";

/** Screen placement and size (CSS px) of the minimap panel's canvas. */
export const minimapLayoutSchema = z
  .object({
    x: z.number().int().min(0).max(20_000),
    y: z.number().int().min(0).max(20_000),
    width: z.number().int().min(220).max(720),
    height: z.number().int().min(180).max(560),
  })
  .strict();

/**
 * Account-wide client UI preferences. Strict and bounded on purpose: the
 * server persists only known keys with validated ranges, never a free-form
 * blob. Absent keys mean "use the client default".
 */
export const uiSettingsSchema = z
  .object({
    minimap: minimapLayoutSchema.optional(),
    chatPinnedOpen: z.boolean().optional(),
  })
  .strict();

export type MinimapLayout = z.infer<typeof minimapLayoutSchema>;
export type UiSettings = z.infer<typeof uiSettingsSchema>;
