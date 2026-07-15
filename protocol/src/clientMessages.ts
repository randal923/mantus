import { z } from "zod";
import { createCharacterInputSchema } from "./character";
import { DIRECTIONS } from "./direction";
import { languageSchema } from "./language";
import { PROTOCOL_LIMITS } from "./limits";

export const authMessageSchema = z.object({
  type: z.literal("auth"),
  token: z
    .string()
    .min(1)
    .max(PROTOCOL_LIMITS.maxTokenLength)
    .regex(/^[A-Za-z0-9_.-]+$/),
  language: languageSchema,
});

/** Fixed-size request; normal clients send once after authentication. */
export const listCharactersMessageSchema = z
  .object({ type: z.literal("list-characters") })
  .strict();

/** At most one create is resolved at a time, under the transport rate cap. */
export const createCharacterMessageSchema = createCharacterInputSchema.extend({
  type: z.literal("create-character"),
});

/** Fixed-size world-entry intent; normal clients send once per selection. */
export const selectCharacterMessageSchema = z
  .object({
    type: z.literal("select-character"),
    characterId: z.string().uuid(),
  })
  .strict();

/** Starts or redirects held movement; normal clients send once per key change. */
export const moveMessageSchema = z.object({
  type: z.literal("move"),
  direction: z.enum(DIRECTIONS),
});

/** Stops held movement; covered by the shared message size and rate caps. */
export const stopMoveMessageSchema = z.object({
  type: z.literal("stop-move"),
});

/** Fixed-size account setting intent; covered by the 4 KiB/30-per-second caps. */
export const setLanguageMessageSchema = z.object({
  type: z.literal("set-language"),
  language: languageSchema,
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  authMessageSchema,
  listCharactersMessageSchema,
  createCharacterMessageSchema,
  selectCharacterMessageSchema,
  moveMessageSchema,
  stopMoveMessageSchema,
  setLanguageMessageSchema,
]);

export type AuthMessage = z.infer<typeof authMessageSchema>;
export type ListCharactersMessage = z.infer<
  typeof listCharactersMessageSchema
>;
export type CreateCharacterMessage = z.infer<
  typeof createCharacterMessageSchema
>;
export type SelectCharacterMessage = z.infer<
  typeof selectCharacterMessageSchema
>;
export type MoveMessage = z.infer<typeof moveMessageSchema>;
export type StopMoveMessage = z.infer<typeof stopMoveMessageSchema>;
export type SetLanguageMessage = z.infer<typeof setLanguageMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
