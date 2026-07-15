import { z } from "zod";
import {
  characterCreationOptionsSchema,
  characterOutfitSchema,
  characterSummarySchema,
  ownCharacterStateSchema,
} from "./character";
import { DIRECTIONS } from "./direction";
import { languageSchema } from "./language";
import { positionSchema } from "./position";

export const playerStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: positionSchema,
  positionRevision: z.number().int().nonnegative(),
  direction: z.enum(DIRECTIONS),
  outfit: characterOutfitSchema,
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
  language: languageSchema,
});

export const languageUpdatedMessageSchema = z.object({
  type: z.literal("language-updated"),
  language: languageSchema,
});

export const characterListMessageSchema = z.object({
  type: z.literal("character-list"),
  characters: z.array(characterSummarySchema),
  creationOptions: characterCreationOptionsSchema,
});

export const welcomeMessageSchema = z.object({
  type: z.literal("welcome"),
  playerId: z.string(),
  character: ownCharacterStateSchema,
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
  from: positionSchema,
  position: positionSchema,
  direction: z.enum(DIRECTIONS),
  positionRevision: z.number().int().nonnegative(),
  durationMs: z.number().int().min(0).max(60_000),
});

export const positionCorrectionMessageSchema = z.object({
  type: z.literal("position-correction"),
  playerId: z.string(),
  position: positionSchema,
  direction: z.enum(DIRECTIONS),
  positionRevision: z.number().int().nonnegative(),
  retryAfterMs: z.number().int().min(0).max(60_000),
  reason: z.enum(["cooldown", "blocked", "occupied", "invalid-transition"]),
});

export const mapItemStateSchema = z.object({
  instanceId: z.string().min(1).max(128),
  itemId: z.number().int().positive().max(65_535),
  stackIndex: z.number().int().min(0).max(255),
});

export const tileStateSchema = z.object({
  position: positionSchema,
  revision: z.number().int().nonnegative(),
  items: z.array(mapItemStateSchema).max(16),
});

export const tileStatesMessageSchema = z.object({
  type: z.literal("tile-states"),
  visible: z.array(tileStateSchema).max(1_024),
  hidden: z.array(positionSchema).max(1_024),
});

export const serverErrorCodeSchema = z.enum([
  "account-banned",
  "already-authenticated",
  "already-joined",
  "auth-failed",
  "auth-required",
  "auth-timeout",
  "character-limit-reached",
  "character-list-failed",
  "character-load-failed",
  "character-name-invalid",
  "character-name-taken",
  "character-not-found",
  "character-operation-pending",
  "invalid-message",
  "join-required",
  "language-update-failed",
  "language-update-pending",
  "logged-in-elsewhere",
  "rate-limited",
  "world-full",
]);

export const errorMessageSchema = z.object({
  type: z.literal("error"),
  code: serverErrorCodeSchema,
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  authOkMessageSchema,
  languageUpdatedMessageSchema,
  characterListMessageSchema,
  welcomeMessageSchema,
  playerJoinedMessageSchema,
  playerLeftMessageSchema,
  playerMovedMessageSchema,
  positionCorrectionMessageSchema,
  tileStatesMessageSchema,
  errorMessageSchema,
]);

export type PlayerState = z.infer<typeof playerStateSchema>;
export type MapInfo = z.infer<typeof mapInfoSchema>;
export type MapItemState = z.infer<typeof mapItemStateSchema>;
export type TileState = z.infer<typeof tileStateSchema>;
export type CharacterListMessage = z.infer<typeof characterListMessageSchema>;
export type WelcomeMessage = z.infer<typeof welcomeMessageSchema>;
export type ServerErrorCode = z.infer<typeof serverErrorCodeSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
