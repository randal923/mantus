import { describe, expect, it } from "vitest";
import {
  clientMessageSchema,
  HUNTING_BOT_LIMITS,
  PROTOCOL_LIMITS,
  serverMessageSchema,
} from "@tibia/protocol";

const waypoint = (index: number) => ({
  x: 32_000 + (index % 100),
  y: 31_000 + index,
  z: 7,
});

const maximalRoute = {
  huntName: "x".repeat(HUNTING_BOT_LIMITS.maxHuntNameLength),
  waypoints: Array.from({ length: HUNTING_BOT_LIMITS.maxWaypoints }, (_, index) =>
    waypoint(index),
  ),
};

describe("hunting bot intent schemas", () => {
  it("accepts a saved route, an arm intent and a trace request", () => {
    for (const message of [
      { type: "update-hunting-bot-route", route: maximalRoute },
      { type: "set-hunting-bot-enabled", enabled: true },
      {
        type: "hunting-bot-trace",
        points: [waypoint(0), waypoint(1)],
      },
    ]) {
      expect(clientMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  it("rejects malformed, oversized and out-of-range payloads", () => {
    const rejected: ReadonlyArray<unknown> = [
      // Over the waypoint cap.
      {
        type: "update-hunting-bot-route",
        route: {
          huntName: "",
          waypoints: Array.from(
            { length: HUNTING_BOT_LIMITS.maxWaypoints + 1 },
            (_, index) => waypoint(index),
          ),
        },
      },
      // Hunt name past its cap.
      {
        type: "update-hunting-bot-route",
        route: {
          huntName: "x".repeat(HUNTING_BOT_LIMITS.maxHuntNameLength + 1),
          waypoints: [],
        },
      },
      // Coordinates outside the map's addressable range.
      {
        type: "update-hunting-bot-route",
        route: { huntName: "", waypoints: [{ x: -1, y: 0, z: 7 }] },
      },
      {
        type: "update-hunting-bot-route",
        route: { huntName: "", waypoints: [{ x: 0, y: 0, z: 16 }] },
      },
      // Fractional tiles.
      {
        type: "update-hunting-bot-route",
        route: { huntName: "", waypoints: [{ x: 0.5, y: 0, z: 7 }] },
      },
      // Unknown members are refused outright.
      {
        type: "update-hunting-bot-route",
        route: { huntName: "", waypoints: [], speed: 999 },
      },
      { type: "set-hunting-bot-enabled" },
      { type: "set-hunting-bot-enabled", enabled: "yes" },
      // A trace needs at least two points and no more than the cap.
      { type: "hunting-bot-trace", points: [waypoint(0)] },
      {
        type: "hunting-bot-trace",
        points: Array.from(
          { length: HUNTING_BOT_LIMITS.maxTracePoints + 1 },
          (_, index) => waypoint(index),
        ),
      },
    ];
    for (const message of rejected) {
      expect(clientMessageSchema.safeParse(message).success).toBe(false);
    }
  });

  it("keeps the largest schema-valid messages within the transport cap", () => {
    const messages: ReadonlyArray<unknown> = [
      { type: "update-hunting-bot-route", route: maximalRoute },
      {
        type: "hunting-bot-trace",
        points: Array.from(
          { length: HUNTING_BOT_LIMITS.maxTracePoints },
          (_, index) => waypoint(index),
        ),
      },
      { type: "hunting-bot-route", route: maximalRoute },
      {
        type: "hunting-bot-traced",
        waypoints: maximalRoute.waypoints,
        unresolvedWaypointIndexes: Array.from(
          { length: HUNTING_BOT_LIMITS.maxWaypoints },
          (_, index) => index,
        ),
      },
    ];
    for (const message of messages) {
      expect(
        Buffer.byteLength(JSON.stringify(message)),
      ).toBeLessThanOrEqual(PROTOCOL_LIMITS.maxMessageBytes);
    }
  });

  it("round-trips the server messages the window listens for", () => {
    for (const message of [
      { type: "hunting-bot-route", route: maximalRoute },
      {
        type: "hunting-bot-status",
        enabled: true,
        waypointIndex: 3,
        stopReason: null,
      },
      {
        type: "hunting-bot-status",
        enabled: false,
        waypointIndex: 0,
        stopReason: "unreachable",
      },
      {
        type: "hunting-bot-traced",
        waypoints: [waypoint(0)],
        unresolvedWaypointIndexes: [0],
      },
    ]) {
      expect(serverMessageSchema.safeParse(message).success).toBe(true);
    }
  });
});
