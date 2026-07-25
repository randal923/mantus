import { z } from "zod";
import { positionSchema } from "./position";

export const MINIMAP_LIMITS = {
  /** Persistent waypoint flags per character. */
  maxMarkers: 100,
  maxMarkerTextLength: 40,
  maxMarkerIconId: 20,
  /** One marker mutation per half second per session. */
  markerCooldownMs: 500,
  /**
   * How far a walk-to destination may be from the walker, and how much
   * search the server will spend on it. Both are hard caps: the path is
   * computed server-side and every step is still re-validated in the tick.
   */
  maxWalkToDistance: 64,
  maxWalkToVisited: 8_000,
  /** One path request per 250 ms per session. */
  walkToCooldownMs: 250,
} as const;

/**
 * Asks the server to walk to a destination — the minimap's click-to-walk.
 * The client supplies only the destination; the server computes the path
 * itself and re-validates every step at execution time exactly as it does
 * for held movement, so this cannot smuggle a route through blocked tiles.
 */
export const walkToMessageSchema = z
  .object({
    type: z.literal("walk-to"),
    position: positionSchema,
  })
  .strict();

/** Places or replaces one of the character's own persistent map flags. */
export const minimapMarkerSetMessageSchema = z
  .object({
    type: z.literal("minimap-marker-set"),
    position: positionSchema,
    icon: z.number().int().min(0).max(MINIMAP_LIMITS.maxMarkerIconId),
    text: z.string().max(MINIMAP_LIMITS.maxMarkerTextLength),
  })
  .strict();

/** Removes one own marker, addressed by its tile. */
export const minimapMarkerDeleteMessageSchema = z
  .object({
    type: z.literal("minimap-marker-delete"),
    position: positionSchema,
  })
  .strict();

export const minimapMarkerSchema = z
  .object({
    position: positionSchema,
    icon: z.number().int().min(0).max(MINIMAP_LIMITS.maxMarkerIconId),
    text: z.string().max(MINIMAP_LIMITS.maxMarkerTextLength),
  })
  .strict();

/** The requester's own markers; never anyone else's. */
export const minimapMarkersMessageSchema = z
  .object({
    type: z.literal("minimap-markers"),
    markers: z.array(minimapMarkerSchema).max(MINIMAP_LIMITS.maxMarkers),
  })
  .strict();

export type WalkToMessage = z.infer<typeof walkToMessageSchema>;
export type MinimapMarkerSetMessage = z.infer<
  typeof minimapMarkerSetMessageSchema
>;
export type MinimapMarkerDeleteMessage = z.infer<
  typeof minimapMarkerDeleteMessageSchema
>;
export type MinimapMarker = z.infer<typeof minimapMarkerSchema>;
export type MinimapMarkersMessage = z.infer<
  typeof minimapMarkersMessageSchema
>;
