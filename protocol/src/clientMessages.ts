import { z } from "zod";
import { DIRECTIONS } from "./direction";
import { PROTOCOL_LIMITS } from "./limits";

export const joinMessageSchema = z.object({
  type: z.literal("join"),
  name: z
    .string()
    .min(1)
    .max(PROTOCOL_LIMITS.maxNameLength)
    .regex(/^[A-Za-z0-9 -]+$/),
});

export const moveMessageSchema = z.object({
  type: z.literal("move"),
  direction: z.enum(DIRECTIONS),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  joinMessageSchema,
  moveMessageSchema,
]);

export type JoinMessage = z.infer<typeof joinMessageSchema>;
export type MoveMessage = z.infer<typeof moveMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
