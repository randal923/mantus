import { z } from "zod";
import { GEM_ATELIER_LIMITS, GEM_QUALITIES } from "./gemAtelier";
import { wheelDomainSchema } from "./wheel";

export const gemQualitySchema = z.enum(GEM_QUALITIES);

const gemModIdSchema = z.number().int().min(0).max(93);

const nonNegativeCount = z.number().int().min(0);

export const revealedGemSchema = z
  .object({
    id: z.string().uuid(),
    domain: wheelDomainSchema,
    quality: gemQualitySchema,
    locked: z.boolean(),
    /** First (and for regular+ second) basic mod id. */
    basicModIds: z.array(gemModIdSchema).min(1).max(2),
    /** Present on greater gems only. */
    supremeModId: gemModIdSchema.optional(),
  })
  .strict();

const gradeEntrySchema = z
  .object({
    modId: gemModIdSchema,
    grade: z.number().int().min(1).max(GEM_ATELIER_LIMITS.maxGrade),
  })
  .strict();

/** Fixed-size read intent; covered by the 4 KiB / 30-per-second caps. */
export const gemGetMessageSchema = z
  .object({ type: z.literal("wheel-gems-get") })
  .strict();

/**
 * One gem mutation per message; the server re-validates every rule at
 * execution time and enforces GEM_ATELIER_LIMITS.actionCooldownMs per
 * session. Costs are never taken from the message.
 */
export const gemActionMessageSchema = z
  .object({
    type: z.literal("wheel-gem-action"),
    /** Replay guard; a repeated id is answered with the current state. */
    requestId: z.string().uuid(),
    action: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("reveal"), quality: gemQualitySchema }).strict(),
      z.object({ kind: z.literal("destroy"), gemId: z.string().uuid() }).strict(),
      z
        .object({ kind: z.literal("switch-domain"), gemId: z.string().uuid() })
        .strict(),
      z
        .object({ kind: z.literal("toggle-lock"), gemId: z.string().uuid() })
        .strict(),
      z.object({ kind: z.literal("equip"), gemId: z.string().uuid() }).strict(),
      z
        .object({ kind: z.literal("unequip"), domain: wheelDomainSchema })
        .strict(),
      z
        .object({
          kind: z.literal("improve-grade"),
          modKind: z.enum(["basic", "supreme"]),
          modId: gemModIdSchema,
        })
        .strict(),
    ]),
  })
  .strict();

export const gemStateMessageSchema = z
  .object({
    type: z.literal("wheel-gems-state"),
    resources: z
      .object({
        lesserGems: nonNegativeCount,
        regularGems: nonNegativeCount,
        greaterGems: nonNegativeCount,
        lesserFragments: nonNegativeCount,
        greaterFragments: nonNegativeCount,
        /** Carried + bank gold, for affordability display only. */
        gold: nonNegativeCount,
      })
      .strict(),
    revealed: z
      .array(revealedGemSchema)
      .max(GEM_ATELIER_LIMITS.maxRevealedGems),
    /** Equipped gem id per domain vessel. */
    equipped: z
      .object({
        green: z.string().uuid().optional(),
        red: z.string().uuid().optional(),
        blue: z.string().uuid().optional(),
        purple: z.string().uuid().optional(),
      })
      .strict(),
    grades: z
      .object({
        basic: z.array(gradeEntrySchema),
        supreme: z.array(gradeEntrySchema),
      })
      .strict(),
  })
  .strict();

export const gemActionFailedMessageSchema = z
  .object({
    type: z.literal("wheel-gem-failed"),
    reason: z.enum([
      "rate-limited",
      "unavailable",
      "insufficient-gold",
      "insufficient-gems",
      "insufficient-fragments",
      "gem-limit-reached",
      "gem-locked",
      "gem-equipped",
      "gem-not-found",
      "max-grade",
    ]),
  })
  .strict();

export type GemGetMessage = z.infer<typeof gemGetMessageSchema>;
export type GemActionMessage = z.infer<typeof gemActionMessageSchema>;
export type GemAction = GemActionMessage["action"];
export type GemStateMessage = z.infer<typeof gemStateMessageSchema>;
export type GemActionFailedMessage = z.infer<
  typeof gemActionFailedMessageSchema
>;
export type GemActionFailedReason = GemActionFailedMessage["reason"];
export type RevealedGem = z.infer<typeof revealedGemSchema>;
export type GemResources = GemStateMessage["resources"];
export type GemGrades = GemStateMessage["grades"];
export type GemEquipped = GemStateMessage["equipped"];
