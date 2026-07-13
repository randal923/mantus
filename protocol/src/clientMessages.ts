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

/** Starts or redirects held movement; normal clients send once per key change. */
export const moveMessageSchema = z.object({
  type: z.literal("move"),
  direction: z.enum(DIRECTIONS),
});

/** Stops held movement; covered by the shared message size and rate caps. */
export const stopMoveMessageSchema = z.object({
  type: z.literal("stop-move"),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  joinMessageSchema,
  moveMessageSchema,
  stopMoveMessageSchema,
]);

export type JoinMessage = z.infer<typeof joinMessageSchema>;
export type MoveMessage = z.infer<typeof moveMessageSchema>;
export type StopMoveMessage = z.infer<typeof stopMoveMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
