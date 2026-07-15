import { z } from "zod";
import { DIRECTIONS } from "./direction";

export const playerStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  direction: z.enum(DIRECTIONS),
});

/**
 * Static terrain is public data served over HTTP from
 * /assets/map/<name>/; the socket only carries dynamic, view-filtered state.
 */
export const mapInfoSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
});

export const authOkMessageSchema = z.object({
  type: z.literal("auth-ok"),
});

export const welcomeMessageSchema = z.object({
  type: z.literal("welcome"),
  playerId: z.string(),
  map: mapInfoSchema,
  players: z.array(playerStateSchema),
});

export const playerJoinedMessageSchema = z.object({
  type: z.literal("player-joined"),
  player: playerStateSchema,
});

export const playerLeftMessageSchema = z.object({
  type: z.literal("player-left"),
  playerId: z.string(),
});

export const playerMovedMessageSchema = z.object({
  type: z.literal("player-moved"),
  playerId: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  direction: z.enum(DIRECTIONS),
});

export const errorMessageSchema = z.object({
  type: z.literal("error"),
  code: z.string().max(64),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  authOkMessageSchema,
  welcomeMessageSchema,
  playerJoinedMessageSchema,
  playerLeftMessageSchema,
  playerMovedMessageSchema,
  errorMessageSchema,
]);

export type PlayerState = z.infer<typeof playerStateSchema>;
export type MapInfo = z.infer<typeof mapInfoSchema>;
export type WelcomeMessage = z.infer<typeof welcomeMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
