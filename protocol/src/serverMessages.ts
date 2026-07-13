import { z } from "zod";
import { DIRECTIONS } from "./direction";

export const playerStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  direction: z.enum(DIRECTIONS),
});

export const mapStateSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  blocked: z.array(z.tuple([z.number().int(), z.number().int()])),
});

export const welcomeMessageSchema = z.object({
  type: z.literal("welcome"),
  playerId: z.string(),
  map: mapStateSchema,
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
  welcomeMessageSchema,
  playerJoinedMessageSchema,
  playerLeftMessageSchema,
  playerMovedMessageSchema,
  errorMessageSchema,
]);

export type PlayerState = z.infer<typeof playerStateSchema>;
export type MapState = z.infer<typeof mapStateSchema>;
export type WelcomeMessage = z.infer<typeof welcomeMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
