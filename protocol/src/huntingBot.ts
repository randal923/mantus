import { z } from "zod";
import { positionSchema } from "./position";

export const HUNTING_BOT_LIMITS = {
  /** Waypoints one saved route may hold, traced or hand-edited. */
  maxWaypoints: 200,
  /** Raw guide points one trace request may carry. */
  maxTracePoints: 256,
  maxHuntNameLength: 64,
  /** One trace request per two seconds per session; the search is not free. */
  traceCooldownMs: 2_000,
  /**
   * Search budgets for the one-shot trace: the whole request and a single
   * leg of it. The tick runs at 25 ms, so a trace has to stay small enough
   * that one request cannot stall the loop for everyone else.
   */
  maxTraceVisited: 30_000,
  maxTraceLegVisited: 3_000,
  /** Straight-line spacing a long guide leg is subdivided into. */
  traceAnchorSpacing: 16,
  /**
   * Samples one guide segment may be broken into. The longest segment in the
   * real catalog is 135 tiles, so 32 is far past anything a guide draws; the
   * cap only exists so a caller cannot ask for a segment across the map and
   * turn it into thousands of searches.
   */
  maxLegSamples: 32,
  /**
   * How far outside a leg's bounding box the search may wander. Measured
   * against the real guide catalog: 20 leaves 5.8 % of legs unsolved, 40
   * leaves 5.0 % for 17 % more search, and anything beyond that buys almost
   * nothing — the rest need a ladder or a rope, which a walker cannot use.
   */
  traceLegMargin: 40,
  /** Longest straight run the tracer leaves without emitting a waypoint. */
  maxWaypointSpacing: 12,
  /** How far a raw guide point may be nudged to reach walkable ground. */
  maxSnapRadius: 4,
  /**
   * How far the character may stand from the route when the bot is armed.
   * The distance is only a cheap pre-filter: arming actually searches for
   * the joining walk (`maxStartVisited`) and refuses when none exists, so
   * the gate never promises a walk the bot cannot deliver.
   */
  maxStartDistance: 30,
  /**
   * One-shot search budget for the joining walk when the bot is armed.
   * Sized past the worst `maxStartDistance` diagonal (Manhattan 60, ~7200
   * breadth-first nodes) plus detour slack; it runs once per arm click, so
   * it may be far larger than the per-waypoint runtime budget.
   */
  maxStartVisited: 10_000,
  /**
   * Budget for pathing to the next waypoint while the bot runs. Sized for
   * the longest walk the bot legitimately performs — joining the route from
   * `maxStartDistance` away, rejoining after a chase pulled the character
   * off it, or a hand-placed leg of a few dozen tiles — while still
   * bounding what a room full of running bots can spend on path searches.
   */
  maxRuntimeVisited: 4_000,
  /** Minimum gap between two runtime path searches for one session. */
  repathCooldownMs: 400,
  /**
   * Failed path searches at one waypoint, each `repathCooldownMs` apart,
   * before the bot gives up on it and skips ahead. A failure is usually
   * transient — a creature standing on the goal — so the bot waits it out
   * instead of racing around the ring faster than the character walks.
   */
  skipAfterFailedRepaths: 5,
  /**
   * Consecutive waypoints the bot may fail to reach before it gives up and
   * stops itself, rather than spinning on a route the map cannot satisfy.
   */
  maxConsecutiveSkips: 8,
} as const;

/**
 * A hunting route the character owns: an ordered ring of tiles the bot walks
 * forever. It is pure geometry — no gameplay outcome is derived from it, and
 * the server re-paths and re-validates every step at execution time, so a
 * hand-edited waypoint can only ever be a *request* to be somewhere.
 */
export const huntingBotRouteSchema = z
  .object({
    /** The hunt the route was seeded from; shown in the window, never trusted. */
    huntName: z.string().max(HUNTING_BOT_LIMITS.maxHuntNameLength),
    waypoints: z.array(positionSchema).max(HUNTING_BOT_LIMITS.maxWaypoints),
  })
  .strict();

export const DEFAULT_HUNTING_BOT_ROUTE = {
  huntName: "",
  waypoints: [],
} as const satisfies z.infer<typeof huntingBotRouteSchema>;

/** Why the server switched the bot off on its own. */
export const huntingBotStopReasonSchema = z.enum([
  /** Armed while standing too far from the route, or on another floor. */
  "out-of-range",
  /** The saved route has no waypoints to walk. */
  "no-route",
  /** Every waypoint in a lap failed to path; the route needs editing. */
  "unreachable",
  /** The character died. */
  "died",
]);

/**
 * Replaces the stored route. Sent debounced from the hunting-bot window while
 * waypoints are dragged, added, or deleted — a couple per second at most,
 * ~6 KiB at the waypoint cap.
 */
export const updateHuntingBotRouteMessageSchema = z
  .object({
    type: z.literal("update-hunting-bot-route"),
    route: huntingBotRouteSchema,
  })
  .strict();

/**
 * Starts or stops the bot. Deliberately separate from the route so arming it
 * costs one tiny message, and deliberately *not* persisted: a character never
 * logs in already walking.
 */
export const setHuntingBotEnabledMessageSchema = z
  .object({
    type: z.literal("set-hunting-bot-enabled"),
    enabled: z.boolean(),
  })
  .strict();

/**
 * Asks the server to turn a hunting guide's straight-line route into a
 * walkable one. The client supplies only the points it wants visited; the
 * server owns walkability and computes the path itself, exactly as it does
 * for minimap click-to-walk (charter rules 1 and 4).
 */
export const huntingBotTraceMessageSchema = z
  .object({
    type: z.literal("hunting-bot-trace"),
    points: z
      .array(positionSchema)
      .min(2)
      .max(HUNTING_BOT_LIMITS.maxTracePoints),
  })
  .strict();

/** Echoes the server-stored route after an accepted save, or after a rollback. */
export const huntingBotRouteMessageSchema = z
  .object({
    type: z.literal("hunting-bot-route"),
    route: huntingBotRouteSchema,
  })
  .strict();

/** Live loop state: pushed only when it changes, never on a cadence. */
export const huntingBotStatusMessageSchema = z
  .object({
    type: z.literal("hunting-bot-status"),
    enabled: z.boolean(),
    /** Which waypoint the bot is currently walking toward. */
    waypointIndex: z
      .number()
      .int()
      .min(0)
      .max(HUNTING_BOT_LIMITS.maxWaypoints),
    stopReason: huntingBotStopReasonSchema.nullable(),
  })
  .strict();

/**
 * The traced route. `unresolvedWaypointIndexes` names the waypoints the
 * server could not reach from their predecessor, so the window can highlight
 * exactly the legs a player has to fix by hand.
 */
export const huntingBotTracedMessageSchema = z
  .object({
    type: z.literal("hunting-bot-traced"),
    waypoints: z.array(positionSchema).max(HUNTING_BOT_LIMITS.maxWaypoints),
    unresolvedWaypointIndexes: z
      .array(z.number().int().min(0).max(HUNTING_BOT_LIMITS.maxWaypoints))
      .max(HUNTING_BOT_LIMITS.maxWaypoints),
  })
  .strict();

export type HuntingBotRoute = z.infer<typeof huntingBotRouteSchema>;
export type HuntingBotStopReason = z.infer<typeof huntingBotStopReasonSchema>;
export type UpdateHuntingBotRouteMessage = z.infer<
  typeof updateHuntingBotRouteMessageSchema
>;
export type SetHuntingBotEnabledMessage = z.infer<
  typeof setHuntingBotEnabledMessageSchema
>;
export type HuntingBotTraceMessage = z.infer<
  typeof huntingBotTraceMessageSchema
>;
export type HuntingBotRouteMessage = z.infer<
  typeof huntingBotRouteMessageSchema
>;
export type HuntingBotStatusMessage = z.infer<
  typeof huntingBotStatusMessageSchema
>;
export type HuntingBotTracedMessage = z.infer<
  typeof huntingBotTracedMessageSchema
>;
