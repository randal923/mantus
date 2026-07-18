import { z } from "zod";

/**
 * Server → client feedback for a dev-only GM chat command (e.g. "/i rope").
 * Only emitted by servers running with DEV_COMMANDS=1; carries no game state
 * beyond the human-readable outcome text.
 */
export const gmResponseMessageSchema = z
  .object({
    type: z.literal("gm-response"),
    ok: z.boolean(),
    text: z.string().min(1).max(200),
  })
  .strict();

export type GmResponseMessage = z.infer<typeof gmResponseMessageSchema>;
