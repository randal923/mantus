import { z } from "zod";
import { positionSchema } from "./position";

/**
 * What the player pointed at (Tibia's left+right chord, or the map menu's
 * "Look" entry). Every field is a *reference* the server re-resolves at
 * execution time — Canary's `playerLookAt`/`playerLookInBattleList` pair.
 *
 * `map` carries the client id of the topmost sprite the player actually
 * clicked because the server only tracks mutable/interactive world items;
 * static scenery lives in the client's region artifact. The server validates
 * the id against its own pinned catalog, requires the tile to be in view, and
 * prefers its own authoritative instance whenever one stands on that tile, so
 * the id can never do more than pick which catalog description is read back
 * (charter rule 1).
 */
export const lookTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("creature"),
      creatureId: z.string().min(1).max(192),
    })
    .strict(),
  z
    .object({
      kind: z.literal("map"),
      position: positionSchema,
      itemId: z.number().int().positive().max(65_535).optional(),
    })
    .strict(),
]);

/**
 * Fixed-size look intent, well inside the shared 4 KiB cap. Rate: one per
 * click, bounded by the shared transport cap; looking has no game effect and
 * therefore no exhaust of its own (Canary does not gate it either).
 */
export const lookMessageSchema = z
  .object({
    type: z.literal("look"),
    target: lookTargetSchema,
  })
  .strict();

/**
 * The server-composed "You see ..." line (Canary's `MESSAGE_LOOK`). The text
 * is authored entirely server-side from the pinned item catalog and live
 * creature/house state; clients render it verbatim and never compose one.
 */
export const lookTextMessageSchema = z
  .object({
    type: z.literal("look-text"),
    text: z
      .string()
      .min(1)
      .max(1_024)
      // Canary's descriptions are multi-line: newlines are the only control
      // character allowed, and renderers must treat the value as plain text.
      .regex(/^(?:[^\p{Cc}]|\n)+$/u),
  })
  .strict();

export type LookTarget = z.infer<typeof lookTargetSchema>;
export type LookMessage = z.infer<typeof lookMessageSchema>;
export type LookTextMessage = z.infer<typeof lookTextMessageSchema>;
