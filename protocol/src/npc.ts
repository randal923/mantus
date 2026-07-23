import { z } from "zod";
import { positionSchema } from "./position";

const npcReferenceSchema = z.string().min(1).max(192);
const conversationReferenceSchema = z.string().uuid();
const choiceReferenceSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** One bounded click intent; the shared transport rate cap applies. */
export const npcDialogueChoiceMessageSchema = z
  .object({
    type: z.literal("npc-dialogue-choice"),
    npcId: npcReferenceSchema,
    conversationId: conversationReferenceSchema,
    choiceId: choiceReferenceSchema,
  })
  .strict();

export const npcDialogueOptionSchema = z
  .object({
    id: choiceReferenceSchema,
    label: z.string().min(1).max(40),
    action: z.literal("travel").optional(),
  })
  .strict();

export const npcDialogueMessageSchema = z
  .object({
    type: z.literal("npc-dialogue"),
    npcId: npcReferenceSchema,
    npcName: z.string().min(1).max(100),
    conversationId: conversationReferenceSchema,
    position: positionSchema,
    text: z.string().min(1).max(1_000),
    options: z.array(npcDialogueOptionSchema).max(16),
    travelPrefetchPosition: positionSchema.optional(),
  })
  .strict();

export const npcDialogueClosedMessageSchema = z
  .object({
    type: z.literal("npc-dialogue-closed"),
    npcId: npcReferenceSchema,
    conversationId: conversationReferenceSchema,
    reason: z.enum([
      "farewell",
      "walked-away",
      "timed-out",
      "npc-removed",
      "travelled",
    ]),
  })
  .strict();

export type NpcDialogueChoiceMessage = z.infer<
  typeof npcDialogueChoiceMessageSchema
>;
export type NpcDialogueMessage = z.infer<typeof npcDialogueMessageSchema>;
export type NpcDialogueClosedMessage = z.infer<
  typeof npcDialogueClosedMessageSchema
>;
